import { z } from "zod";
import { tool } from "ai";
import type { Env, RecalledMemory } from "../types.js";
import { embed, recallMemory } from "../memory/vectorize.js";

export const memoryRecallInputSchema = z.object({
  query: z.string().min(2).describe("Free-form query to search prior briefings."),
  topK: z.number().int().min(1).max(10).default(5),
});

export type MemoryRecallInput = z.infer<typeof memoryRecallInputSchema>;

export async function runMemoryRecall(env: Env, input: MemoryRecallInput): Promise<RecalledMemory[]> {
  const vector = await embed(env, input.query);
  const threshold = Number(env.MEMORY_RECALL_THRESHOLD);
  return recallMemory(env, vector, input.topK, Number.isFinite(threshold) ? threshold : 0.72);
}

export function memoryRecallTool(env: Env) {
  return tool({
    description: "Recall semantically related past briefings for the current question.",
    inputSchema: memoryRecallInputSchema,
    execute: async ({ query, topK }: MemoryRecallInput) => runMemoryRecall(env, { query, topK }),
  });
}
