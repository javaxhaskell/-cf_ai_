import type { Env } from "./types.js";
import { runMemoryRecall } from "./tools/memory-recall.js";

/**
 * Lightweight MCP-style JSON-RPC endpoint at /api/mcp.
 *
 * Implements just enough of the MCP wire format (JSON-RPC 2.0) for `tools/list`
 * and `tools/call` so other agents and Claude Desktop / Cursor / etc. can
 * consume Clarity's memory recall tool over plain HTTP without standing up a
 * full SSE / WebSocket MCP transport.
 *
 * This is intentionally minimal. The full Agents-SDK `McpAgent` (with SSE
 * transport, OAuth, elicitations, etc.) is documented in README → Future work.
 */
const TOOLS = [
  {
    name: "clarity.memory_recall",
    description:
      "Recall semantically related past briefings stored by cf_ai_clarity. Returns top-K matches above the configured threshold.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-form question to recall against" },
        topK: { type: "integer", minimum: 1, maximum: 10, default: 5 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
] as const;

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

export async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    return Response.json({
      protocol: "mcp-jsonrpc-1",
      tools: TOOLS,
      transport: "http",
    });
  }
  if (request.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, "parse error");
  }

  const id = body.id ?? null;

  if (body.method === "tools/list") {
    return jsonRpcResult(id, { tools: TOOLS });
  }

  if (body.method === "tools/call") {
    const params = body.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
    if (!params?.name) return jsonRpcError(id, -32602, "missing tool name");
    if (params.name !== "clarity.memory_recall") {
      return jsonRpcError(id, -32601, `unknown tool: ${params.name}`);
    }
    const args = params.arguments ?? {};
    const query = typeof args.query === "string" ? args.query : "";
    const topK = typeof args.topK === "number" ? args.topK : 5;
    if (!query) return jsonRpcError(id, -32602, "missing query");
    try {
      const result = await runMemoryRecall(env, { query, topK });
      return jsonRpcResult(id, {
        content: [{ type: "json", json: result }],
      });
    } catch (err) {
      return jsonRpcError(id, -32603, err instanceof Error ? err.message : "recall failed");
    }
  }

  return jsonRpcError(id, -32601, `method not found: ${body.method}`);
}

function jsonRpcResult(id: string | number | null, result: unknown): Response {
  const body: JsonRpcResponse = { jsonrpc: "2.0", id, result };
  return Response.json(body);
}

function jsonRpcError(id: string | number | null, code: number, message: string): Response {
  const body: JsonRpcResponse = { jsonrpc: "2.0", id, error: { code, message } };
  return Response.json(body, { status: 200 });
}
