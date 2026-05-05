import { routeAgentRequest } from "agents";
import type { Env } from "./types.js";
import { ResearchAgent } from "./agent.js";
import { ResearchWorkflow } from "./workflow.js";
import { loadPrefs, savePrefs, mergePrefs, UserPrefsSchema } from "./memory/kv.js";
import { activeProvider } from "./tools/llm.js";
import { handleMcp } from "./mcp.js";
import { loadBriefing, briefingHtml } from "./briefings.js";

export { ResearchAgent, ResearchWorkflow };

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        name: "cf_ai_clarity",
        version: "0.1.0",
        provider: activeProvider(env),
        primaryModel: env.PRIMARY_MODEL,
        fallbackModel: env.FALLBACK_MODEL,
        embeddingModel: env.EMBEDDING_MODEL,
      });
    }

    if (url.pathname === "/api/prefs" && request.method === "GET") {
      const sessionId = url.searchParams.get("session") || "default";
      const prefs = await loadPrefs(env, sessionId);
      return Response.json(prefs);
    }

    if (url.pathname === "/api/prefs" && request.method === "POST") {
      const sessionId = url.searchParams.get("session") || "default";
      const body = await request.json().catch(() => ({}));
      const partial = UserPrefsSchema.partial().safeParse(body);
      if (!partial.success) return Response.json({ error: "invalid prefs" }, { status: 400 });
      const current = await loadPrefs(env, sessionId);
      const next = mergePrefs(current, partial.data);
      await savePrefs(env, sessionId, next);
      return Response.json(next);
    }

    if (url.pathname === "/api/state" && request.method === "GET") {
      const sessionId = url.searchParams.get("session") || "default";
      const id = env.ResearchAgent.idFromName(sessionId);
      const stub = env.ResearchAgent.get(id);
      return stub.fetch("https://agent/internal/state");
    }

    if (url.pathname === "/api/mcp" || url.pathname.startsWith("/api/mcp/")) {
      return handleMcp(request, env);
    }

    const briefingMatch = url.pathname.match(/^\/b\/([a-z0-9]{1,16})(?:\.json)?$/);
    if (briefingMatch && request.method === "GET") {
      const id = briefingMatch[1];
      if (!id) return new Response("not found", { status: 404 });
      const stored = await loadBriefing(env, id);
      if (!stored) return new Response("briefing not found", { status: 404 });
      if (url.pathname.endsWith(".json")) {
        return Response.json(stored, {
          headers: { "cache-control": "public, max-age=600" },
        });
      }
      return new Response(briefingHtml(stored), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "public, max-age=600",
        },
      });
    }

    const agentResponse = await routeAgentRequest(request, env, { cors: true });
    if (agentResponse) return agentResponse;

    if (request.method === "GET" && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
