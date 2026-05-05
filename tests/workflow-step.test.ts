import { describe, it, expect, vi } from "vitest";
import { runLlm } from "../src/server/tools/llm.js";
import { tryParsePlan } from "../src/server/prompts/planner.js";
import { tryParseSourceSummary } from "../src/server/prompts/summarizer.js";
import { buildPlannerPrompt, PLANNER_SYSTEM } from "../src/server/prompts/planner.js";
import {
  buildSummarizerPrompt,
  SUMMARIZER_SYSTEM,
} from "../src/server/prompts/summarizer.js";
import type { Env } from "../src/server/types.js";

function makeEnv(answers: string[]): Env {
  let i = 0;
  const ai = {
    run: vi.fn(async () => {
      const answer = answers[i] ?? answers[answers.length - 1] ?? "";
      i += 1;
      return { response: answer };
    }),
  };
  return {
    AI: ai,
    PRIMARY_MODEL: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    FALLBACK_MODEL: "@cf/meta/llama-3.1-8b-instruct",
  } as unknown as Env;
}

describe("planner step (mocked AI)", () => {
  it("end-to-end: prompt → LLM → parse → plan", async () => {
    const env = makeEnv([
      JSON.stringify({
        topic: "Postgres vs SQLite at the edge",
        questions: ["What latency do they offer?", "What's the storage model?"],
        queries: ["postgres edge", "sqlite edge"],
        expectedAngles: ["latency", "consistency"],
      }),
    ]);
    const raw = await runLlm(env, {
      system: PLANNER_SYSTEM,
      user: buildPlannerPrompt("Compare Postgres vs SQLite for an edge-deployed app", []),
      json: true,
    });
    const plan = tryParsePlan(raw);
    expect(plan?.queries).toHaveLength(2);
    expect(plan?.topic).toContain("Postgres");
  });

  it("retries via fallback when primary returns garbage and fallback returns valid JSON", async () => {
    let calls = 0;
    const env = {
      AI: {
        run: vi.fn(async (model: string) => {
          calls += 1;
          if (model.includes("llama-3.3")) {
            throw new Error("primary unavailable");
          }
          return {
            response: JSON.stringify({
              topic: "X",
              questions: ["q1", "q2"],
              queries: ["a", "b"],
              expectedAngles: ["angle"],
            }),
          };
        }),
      },
      PRIMARY_MODEL: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      FALLBACK_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    } as unknown as Env;

    const raw = await runLlm(env, {
      system: PLANNER_SYSTEM,
      user: buildPlannerPrompt("test", []),
      json: true,
    });
    const plan = tryParsePlan(raw);
    expect(plan).not.toBeNull();
    expect(calls).toBe(2);
  });
});

describe("summarize step (mocked AI)", () => {
  it("returns a parsed summary for a fetched page", async () => {
    const env = makeEnv([
      JSON.stringify({
        bullets: ["Postgres is a relational DB", "It supports MVCC"],
        relevance: 0.9,
      }),
    ]);
    const raw = await runLlm(env, {
      system: SUMMARIZER_SYSTEM,
      user: buildSummarizerPrompt("What is Postgres?", "PostgreSQL", "PostgreSQL is a relational DB."),
      json: true,
    });
    const parsed = tryParseSourceSummary(raw);
    expect(parsed?.relevance).toBe(0.9);
    expect(parsed?.bullets).toHaveLength(2);
  });

  it("yields null on unparseable LLM output", async () => {
    const env = makeEnv(["not json at all"]);
    const raw = await runLlm(env, {
      system: SUMMARIZER_SYSTEM,
      user: buildSummarizerPrompt("q", "t", "x"),
      json: true,
    });
    expect(tryParseSourceSummary(raw)).toBeNull();
  });
});
