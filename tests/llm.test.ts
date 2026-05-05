import { describe, it, expect, vi } from "vitest";
import { runLlm } from "../src/server/tools/llm.js";
import type { Env } from "../src/server/types.js";

function makeEnv(aiRun: (model: string, input: unknown) => unknown): Env {
  return {
    PRIMARY_MODEL: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    FALLBACK_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    AI: { run: vi.fn((model: string, input: unknown) => aiRun(model, input)) },
  } as unknown as Env;
}

describe("runLlm", () => {
  it("returns the primary model response when available", async () => {
    const env = makeEnv(() => Promise.resolve({ response: "hello" }));
    const out = await runLlm(env, { system: "s", user: "u" });
    expect(out).toBe("hello");
  });

  it("falls back to secondary model on primary failure", async () => {
    let calls = 0;
    const env = makeEnv((model) => {
      calls += 1;
      if (model.includes("llama-3.3")) throw new Error("rate-limited");
      return Promise.resolve({ response: "fallback-result" });
    });
    const out = await runLlm(env, { system: "s", user: "u" });
    expect(out).toBe("fallback-result");
    expect(calls).toBe(2);
  });

  it("propagates if both models fail", async () => {
    const env = makeEnv(() => {
      throw new Error("boom");
    });
    await expect(runLlm(env, { system: "s", user: "u" })).rejects.toThrow();
  });

  it("requests JSON response_format when json:true", async () => {
    const seen: unknown[] = [];
    const env = makeEnv((_model, input) => {
      seen.push(input);
      return Promise.resolve({ response: "{}" });
    });
    await runLlm(env, { system: "s", user: "u", json: true });
    const inp = seen[0] as { response_format?: { type: string } };
    expect(inp.response_format?.type).toBe("json_object");
  });

  it("supports the alternate { result: { response } } shape", async () => {
    const env = makeEnv(() => Promise.resolve({ result: { response: "alt-shape" } }));
    const out = await runLlm(env, { system: "s", user: "u" });
    expect(out).toBe("alt-shape");
  });
});
