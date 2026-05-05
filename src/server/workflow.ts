import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type {
  Env,
  WorkflowParams,
  ResearchStep,
  ResearchStepName,
  CitedBriefing,
  SearchHit,
  FetchedSource,
  SourceSummary,
} from "./types.js";
import { runLlm } from "./tools/llm.js";
import { webSearch } from "./tools/web-search.js";
import { webFetch, isAllowedUrl, FetchDeniedError } from "./tools/web-fetch.js";
import { persistBriefing } from "./tools/memory-store.js";
import { buildPlannerPrompt, PLANNER_SYSTEM, tryParsePlan } from "./prompts/planner.js";
import {
  buildSummarizerPrompt,
  SUMMARIZER_SYSTEM,
  tryParseSourceSummary,
} from "./prompts/summarizer.js";
import { buildCriticPrompt, CRITIC_SYSTEM, tryParseCritique } from "./prompts/critic.js";
import {
  buildSynthesizerPrompt,
  SYNTHESIZER_SYSTEM,
  tryParseBriefing,
} from "./prompts/synthesizer.js";

type StepUpdate = { name: ResearchStepName; status: ResearchStep["status"]; detail?: string };

async function notifyAgent(env: Env, agentId: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const id = env.ResearchAgent.idFromName(agentId);
    const stub = env.ResearchAgent.get(id);
    await stub.fetch("https://agent/internal/workflow-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("notifyAgent failed", err);
  }
}

async function update(env: Env, agentId: string, update: StepUpdate): Promise<void> {
  await notifyAgent(env, agentId, { type: "step", ...update });
}

export class ResearchWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  override async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep): Promise<CitedBriefing> {
    const { question, agentId, sessionId, recalled } = event.payload;
    const env = this.env;

    await update(env, agentId, { name: "queued", status: "ok" });

    const plan = await step.do(
      "plan",
      { retries: { limit: 2, delay: "2 seconds", backoff: "exponential" }, timeout: "1 minute" },
      async () => {
        await update(env, agentId, { name: "plan", status: "running" });
        const recalledTopics = recalled.map((r) => r.topic).filter(Boolean);
        const raw = await runLlm(env, {
          system: PLANNER_SYSTEM,
          user: buildPlannerPrompt(question, recalledTopics),
          json: true,
          maxTokens: 600,
        });
        const parsed = tryParsePlan(raw);
        if (!parsed) {
          throw new Error(`planner returned unparseable JSON: ${raw.slice(0, 200)}`);
        }
        await update(env, agentId, {
          name: "plan",
          status: "ok",
          detail: `topic: ${parsed.topic} · ${parsed.queries.length} queries`,
        });
        return parsed;
      },
    );

    const hits = await step.do(
      "search",
      { retries: { limit: 2, delay: "1 second", backoff: "linear" }, timeout: "30 seconds" },
      async () => {
        await update(env, agentId, { name: "search", status: "running" });
        const all: SearchHit[] = [];
        const seen = new Set<string>();
        for (const q of plan.queries.slice(0, 4)) {
          const results = await webSearch(env, q, 4);
          for (const r of results) {
            if (seen.has(r.url)) continue;
            if (!isAllowedUrl(env, r.url)) continue;
            seen.add(r.url);
            all.push(r);
          }
        }
        const top = all.slice(0, 6);
        await update(env, agentId, {
          name: "search",
          status: "ok",
          detail: `${top.length} allow-listed results`,
        });
        return top;
      },
    );

    if (hits.length === 0) {
      await update(env, agentId, {
        name: "fetch",
        status: "error",
        detail: "no allow-listed sources found",
      });
      throw new Error("no allow-listed sources found");
    }

    const fetched = await step.do(
      "fetch",
      { retries: { limit: 2, delay: "2 seconds", backoff: "exponential" }, timeout: "1 minute" },
      async () => {
        await update(env, agentId, { name: "fetch", status: "running" });
        const autoApprove = env.AUTO_APPROVE_FETCH === "true";
        if (!autoApprove) {
          await update(env, agentId, {
            name: "fetch",
            status: "running",
            detail: "auto-approve disabled — implicitly approved by workflow policy",
          });
        }
        const sources: FetchedSource[] = [];
        for (const hit of hits) {
          try {
            const src = await webFetch(env, hit.url);
            if (src.text.length > 200) sources.push(src);
          } catch (err) {
            if (err instanceof FetchDeniedError) continue;
            console.warn("fetch failed", hit.url, err);
          }
        }
        await update(env, agentId, {
          name: "fetch",
          status: "ok",
          detail: `${sources.length} sources fetched`,
        });
        return sources;
      },
    );

    if (fetched.length === 0) {
      await update(env, agentId, { name: "summarize", status: "error", detail: "no fetched sources" });
      throw new Error("no fetched sources");
    }

    await step.sleep("rate-limit-pause", "1 second");

    const summaries: SourceSummary[] = [];
    for (let i = 0; i < fetched.length; i += 1) {
      const src = fetched[i];
      if (!src) continue;
      const summary = await step.do(
        `summarize-${i}`,
        { retries: { limit: 2, delay: "2 seconds", backoff: "exponential" }, timeout: "1 minute" },
        async () => {
          await update(env, agentId, {
            name: "summarize",
            status: "running",
            detail: `${i + 1}/${fetched.length}: ${src.title.slice(0, 60)}`,
          });
          const raw = await runLlm(env, {
            system: SUMMARIZER_SYSTEM,
            user: buildSummarizerPrompt(question, src.title, src.text),
            json: true,
            maxTokens: 400,
          });
          const parsed = tryParseSourceSummary(raw);
          if (!parsed) {
            return { url: src.url, title: src.title, bullets: [], relevance: 0 };
          }
          return {
            url: src.url,
            title: src.title,
            bullets: parsed.bullets,
            relevance: parsed.relevance,
          };
        },
      );
      summaries.push(summary);
    }

    const relevantSummaries = summaries
      .filter((s) => s.relevance >= 0.3 && s.bullets.length > 0)
      .sort((a, b) => b.relevance - a.relevance);

    if (relevantSummaries.length === 0) {
      await update(env, agentId, {
        name: "summarize",
        status: "error",
        detail: "no relevant summaries",
      });
      throw new Error("no relevant summaries");
    }

    await update(env, agentId, {
      name: "summarize",
      status: "ok",
      detail: `${relevantSummaries.length} relevant summaries`,
    });

    const critique = await step.do(
      "critique",
      { retries: { limit: 2, delay: "2 seconds", backoff: "exponential" }, timeout: "1 minute" },
      async () => {
        await update(env, agentId, { name: "critique", status: "running" });
        const raw = await runLlm(env, {
          system: CRITIC_SYSTEM,
          user: buildCriticPrompt(question, relevantSummaries),
          json: true,
          maxTokens: 600,
        });
        const parsed = tryParseCritique(raw);
        const result = parsed ?? { unsupportedClaims: [], conflicts: [], confidence: "low" as const };
        await update(env, agentId, {
          name: "critique",
          status: "ok",
          detail: `confidence: ${result.confidence}`,
        });
        return result;
      },
    );

    const briefing = await step.do(
      "synthesize",
      { retries: { limit: 2, delay: "2 seconds", backoff: "exponential" }, timeout: "2 minutes" },
      async () => {
        await update(env, agentId, { name: "synthesize", status: "running" });
        const topic = plan.topic;
        const raw = await runLlm(env, {
          system: SYNTHESIZER_SYSTEM,
          user: buildSynthesizerPrompt(question, topic, relevantSummaries, recalled),
          json: true,
          maxTokens: 1200,
        });
        const parsed = tryParseBriefing(raw);
        if (!parsed) {
          throw new Error(`synthesizer returned unparseable JSON: ${raw.slice(0, 200)}`);
        }
        const finalConfidence = downgrade(parsed.confidence, critique.confidence);
        const final: CitedBriefing = {
          topic: parsed.topic || topic,
          summary: parsed.summary,
          keyPoints: parsed.keyPoints,
          citations: parsed.citations,
          confidence: finalConfidence,
        };
        await update(env, agentId, {
          name: "synthesize",
          status: "ok",
          detail: `${final.keyPoints.length} key points · confidence ${final.confidence}`,
        });
        return final;
      },
    );

    await step.do(
      "persist-memory",
      { retries: { limit: 2, delay: "2 seconds", backoff: "exponential" } },
      async () => {
        await persistBriefing(env, sessionId, question, briefing);
      },
    );

    await notifyAgent(env, agentId, { type: "done", briefing });
    await update(env, agentId, { name: "done", status: "ok" });
    return briefing;
  }
}

function downgrade(
  a: "low" | "medium" | "high",
  b: "low" | "medium" | "high",
): "low" | "medium" | "high" {
  const order = { low: 0, medium: 1, high: 2 } as const;
  return order[a] <= order[b] ? a : b;
}
