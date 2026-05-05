import { describe, it, expect, vi } from "vitest";
import { handleMcp } from "../src/server/mcp.js";
import type { Env, RecalledMemory } from "../src/server/types.js";

function makeEnv(matches: { id: string; score: number; metadata: Record<string, unknown> }[]): Env {
  return {
    MEMORY_INDEX: { query: vi.fn(async () => ({ matches })) },
    AI: {
      run: vi.fn(async () => ({ data: [[0.1, 0.2, 0.3]] })),
    },
    EMBEDDING_MODEL: "@cf/baai/bge-base-en-v1.5",
    MEMORY_RECALL_THRESHOLD: "0.5",
    MEMORY_RECALL_TOPK: "5",
  } as unknown as Env;
}

describe("/api/mcp", () => {
  it("GET returns the tool registry", async () => {
    const res = await handleMcp(new Request("https://x/api/mcp"), {} as Env);
    const data = (await res.json()) as { protocol: string; tools: unknown[] };
    expect(data.protocol).toBe("mcp-jsonrpc-1");
    expect(data.tools).toHaveLength(1);
  });

  it("rejects non-POST/GET methods", async () => {
    const res = await handleMcp(
      new Request("https://x/api/mcp", { method: "DELETE" }),
      {} as Env,
    );
    expect(res.status).toBe(405);
  });

  it("returns parse error on bad JSON", async () => {
    const res = await handleMcp(
      new Request("https://x/api/mcp", { method: "POST", body: "not json" }),
      {} as Env,
    );
    const data = (await res.json()) as { error: { code: number } };
    expect(data.error.code).toBe(-32700);
  });

  it("tools/list returns the registry", async () => {
    const env = makeEnv([]);
    const res = await handleMcp(
      new Request("https://x/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      env,
    );
    const data = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(data.result.tools[0]?.name).toBe("clarity.memory_recall");
  });

  it("tools/call invokes memory_recall", async () => {
    const env = makeEnv([
      {
        id: "m1",
        score: 0.9,
        metadata: { topic: "Edge SQL", summary: "stuff", ts: 1, sessionId: "s1" },
      },
    ]);
    const res = await handleMcp(
      new Request("https://x/api/mcp", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "abc",
          method: "tools/call",
          params: { name: "clarity.memory_recall", arguments: { query: "edge sql" } },
        }),
      }),
      env,
    );
    const data = (await res.json()) as {
      result: { content: { type: string; json: RecalledMemory[] }[] };
    };
    expect(data.result.content[0]?.json[0]?.topic).toBe("Edge SQL");
  });

  it("tools/call returns -32601 for unknown tool", async () => {
    const res = await handleMcp(
      new Request("https://x/api/mcp", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "unknown.tool", arguments: {} },
        }),
      }),
      makeEnv([]),
    );
    const data = (await res.json()) as { error: { code: number } };
    expect(data.error.code).toBe(-32601);
  });

  it("tools/call returns -32602 when query missing", async () => {
    const res = await handleMcp(
      new Request("https://x/api/mcp", {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "clarity.memory_recall", arguments: {} },
        }),
      }),
      makeEnv([]),
    );
    const data = (await res.json()) as { error: { code: number } };
    expect(data.error.code).toBe(-32602);
  });

  it("returns -32601 for unknown method", async () => {
    const res = await handleMcp(
      new Request("https://x/api/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "totally/made-up" }),
      }),
      {} as Env,
    );
    const data = (await res.json()) as { error: { code: number } };
    expect(data.error.code).toBe(-32601);
  });
});
