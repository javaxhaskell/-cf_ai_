import type { Env, RecalledMemory } from "../types.js";

type EmbeddingResponse = { data: number[][] } | { data: { embedding: number[] }[] };

export async function embed(env: Env, text: string): Promise<number[]> {
  const model = env.EMBEDDING_MODEL;
  const truncated = text.length > 4000 ? text.slice(0, 4000) : text;
  const result = (await env.AI.run(model, { text: [truncated] })) as EmbeddingResponse;
  if (Array.isArray((result as { data: number[][] }).data) && Array.isArray((result as { data: number[][] }).data[0])) {
    const vec = (result as { data: number[][] }).data[0];
    if (!vec) throw new Error("Embedding model returned empty vector");
    return vec;
  }
  const arr = (result as { data: { embedding: number[] }[] }).data;
  const first = arr[0];
  if (!first) throw new Error("Embedding model returned empty result");
  return first.embedding;
}

export type StoredMemory = {
  sessionId: string;
  topic: string;
  summary: string;
  question: string;
  ts: number;
};

export async function storeMemory(
  env: Env,
  id: string,
  vector: number[],
  meta: StoredMemory,
): Promise<void> {
  await env.MEMORY_INDEX.upsert([
    {
      id,
      values: vector,
      metadata: {
        sessionId: meta.sessionId,
        topic: meta.topic,
        summary: meta.summary,
        question: meta.question,
        ts: meta.ts,
      },
    },
  ]);
}

export async function recallMemory(
  env: Env,
  vector: number[],
  topK: number,
  threshold: number,
): Promise<RecalledMemory[]> {
  const result = await env.MEMORY_INDEX.query(vector, {
    topK,
    returnMetadata: "all",
  });
  const matches = (result.matches ?? []) as Array<{
    id: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>;
  return matches
    .filter((m) => m.score >= threshold)
    .map((m) => ({
      id: m.id,
      topic: String(m.metadata?.topic ?? "untitled"),
      summary: String(m.metadata?.summary ?? ""),
      ts: Number(m.metadata?.ts ?? 0),
      score: m.score,
    }));
}
