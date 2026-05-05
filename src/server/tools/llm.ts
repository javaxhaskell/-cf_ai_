import type { Env } from "../types.js";

export type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

export type LlmRunOptions = {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
};

export type LlmProvider = "workers-ai" | "openai" | "anthropic";

type WorkersAiTextResponse = { response?: string; result?: { response?: string } };

/**
 * Run an LLM call. Provider precedence:
 *   1. OPENAI_API_KEY  → OpenAI Responses API   (model: OPENAI_MODEL or gpt-4o-mini)
 *   2. ANTHROPIC_API_KEY → Anthropic Messages   (model: ANTHROPIC_MODEL or claude-haiku-4-5)
 *   3. Workers AI primary  →  Workers AI fallback (Llama 3.3 → Llama 3.1)
 *
 * On any error the next provider in the chain is tried so the agent stays useful
 * even when one provider is down or rate-limited.
 */
export async function runLlm(env: Env, opts: LlmRunOptions): Promise<string> {
  const errors: { provider: LlmProvider; err: unknown }[] = [];

  if (env.OPENAI_API_KEY) {
    try {
      return await callOpenAi(env.OPENAI_API_KEY, env.OPENAI_MODEL ?? "gpt-4o-mini", opts);
    } catch (err) {
      errors.push({ provider: "openai", err });
      console.warn("openai failed, trying next provider", err);
    }
  }

  if (env.ANTHROPIC_API_KEY) {
    try {
      return await callAnthropic(
        env.ANTHROPIC_API_KEY,
        env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
        opts,
      );
    } catch (err) {
      errors.push({ provider: "anthropic", err });
      console.warn("anthropic failed, trying next provider", err);
    }
  }

  try {
    return await callWorkersAi(env, env.PRIMARY_MODEL, opts);
  } catch (err) {
    errors.push({ provider: "workers-ai", err });
    console.warn(`primary model ${env.PRIMARY_MODEL} failed, falling back`, err);
  }

  try {
    return await callWorkersAi(env, env.FALLBACK_MODEL, opts);
  } catch (err) {
    errors.push({ provider: "workers-ai", err });
    throw new Error(
      `all providers failed: ${errors.map((e) => `${e.provider}=${stringifyErr(e.err)}`).join(" | ")}`,
    );
  }
}

async function callWorkersAi(env: Env, model: string, opts: LlmRunOptions): Promise<string> {
  const input: Record<string, unknown> = {
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.json) input.response_format = { type: "json_object" };
  const result = (await env.AI.run(model, input)) as WorkersAiTextResponse;
  const text = result.response ?? result.result?.response ?? "";
  if (!text) throw new Error(`empty response from ${model}`);
  return text;
}

async function callOpenAi(key: string, model: string, opts: LlmRunOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`openai ${res.status}: ${await res.text().catch(() => "?")}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("openai returned empty content");
  return text;
}

async function callAnthropic(key: string, model: string, opts: LlmRunOptions): Promise<string> {
  const body = {
    model,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.2,
    system: opts.system + (opts.json ? "\n\nReturn ONLY a single valid JSON object." : ""),
    messages: [{ role: "user", content: opts.user }],
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`anthropic ${res.status}: ${await res.text().catch(() => "?")}`);
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = (data.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
  if (!text) throw new Error("anthropic returned empty content");
  return text;
}

function stringifyErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function activeProvider(env: Env): LlmProvider {
  if (env.OPENAI_API_KEY) return "openai";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  return "workers-ai";
}
