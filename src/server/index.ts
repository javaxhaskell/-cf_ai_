import { routeAgentRequest } from "agents";
import type { Env } from "./types.js";
import { ResearchAgent } from "./agent.js";
import { ResearchWorkflow } from "./workflow.js";
import { loadPrefs, savePrefs, mergePrefs, UserPrefsSchema } from "./memory/kv.js";

export { ResearchAgent, ResearchWorkflow };

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, name: "cf_ai_clarity", version: "0.1.0" });
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
      const r = await stub.fetch("https://agent/internal/state");
      return r;
    }

    const agentResponse = await routeAgentRequest(request, env, { cors: true });
    if (agentResponse) return agentResponse;

    if (request.method === "GET" && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
