import type { Env } from "../types.js";

export type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

export type LlmRunOptions = {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
};

type WorkersAiTextResponse = { response?: string; result?: { response?: string } };

export async function runLlm(env: Env, opts: LlmRunOptions): Promise<string> {
  const { system, user, json = false, maxTokens = 1024, temperature = 0.2 } = opts;
  const messages: ChatTurn[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  try {
    return await callWorkersAi(env, env.PRIMARY_MODEL, messages, { maxTokens, temperature, json });
  } catch (err) {
    console.warn(`primary model ${env.PRIMARY_MODEL} failed, falling back`, err);
    return await callWorkersAi(env, env.FALLBACK_MODEL, messages, { maxTokens, temperature, json });
  }
}

async function callWorkersAi(
  env: Env,
  model: string,
  messages: ChatTurn[],
  opts: { maxTokens: number; temperature: number; json: boolean },
): Promise<string> {
  const input: Record<string, unknown> = {
    messages,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
  };
  if (opts.json) {
    input.response_format = { type: "json_object" };
  }
  const result = (await env.AI.run(model, input)) as WorkersAiTextResponse;
  const text = result.response ?? result.result?.response ?? "";
  if (!text) throw new Error(`empty response from ${model}`);
  return text;
}
