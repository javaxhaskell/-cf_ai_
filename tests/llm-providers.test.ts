import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runLlm, activeProvider } from "../src/server/tools/llm.js";
import type { Env } from "../src/server/types.js";

function makeEnv(overrides: Partial<Env>): Env {
  return {
    PRIMARY_MODEL: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    FALLBACK_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    AI: { run: vi.fn(async () => ({ response: "workers-ai-output" })) },
    ...overrides,
  } as unknown as Env;
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("activeProvider", () => {
  it("prefers OpenAI when key set", () => {
    expect(activeProvider({ OPENAI_API_KEY: "x" } as unknown as Env)).toBe("openai");
  });
  it("falls back to Anthropic", () => {
    expect(activeProvider({ ANTHROPIC_API_KEY: "x" } as unknown as Env)).toBe("anthropic");
  });
  it("defaults to workers-ai", () => {
    expect(activeProvider({} as Env)).toBe("workers-ai");
  });
});

describe("runLlm provider routing", () => {
  it("uses Workers AI when no external keys are set", async () => {
    const env = makeEnv({});
    const out = await runLlm(env, { system: "s", user: "u" });
    expect(out).toBe("workers-ai-output");
  });

  it("calls OpenAI Chat Completions when OPENAI_API_KEY is set", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "openai-output" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const env = makeEnv({ OPENAI_API_KEY: "sk-test", OPENAI_MODEL: "gpt-4o-mini" });
    const out = await runLlm(env, { system: "s", user: "u", json: true });
    expect(out).toBe("openai-output");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer sk-test" }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.model).toBe("gpt-4o-mini");
  });

  it("calls Anthropic Messages when ANTHROPIC_API_KEY is set (and no OpenAI key)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ content: [{ type: "text", text: "anthropic-output" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const env = makeEnv({ ANTHROPIC_API_KEY: "sk-ant-test" });
    const out = await runLlm(env, { system: "s", user: "u" });
    expect(out).toBe("anthropic-output");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.anthropic.com/v1/messages");
    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("falls through OpenAI → Anthropic → Workers AI", async () => {
    let n = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      n += 1;
      if (n === 1) return new Response("nope", { status: 500 });
      if (n === 2) return new Response("nope", { status: 500 });
      return new Response("nope", { status: 500 });
    });
    const env = makeEnv({
      OPENAI_API_KEY: "sk-bad",
      ANTHROPIC_API_KEY: "sk-ant-bad",
    });
    const out = await runLlm(env, { system: "s", user: "u" });
    expect(out).toBe("workers-ai-output");
  });

  it("aggregates errors when every provider fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
    const env = makeEnv({
      OPENAI_API_KEY: "sk-bad",
      ANTHROPIC_API_KEY: "sk-ant-bad",
      AI: {
        run: vi.fn(async () => {
          throw new Error("workers ai down");
        }),
      } as unknown as Env["AI"],
    });
    await expect(runLlm(env, { system: "s", user: "u" })).rejects.toThrow(/all providers failed/);
  });
});
