import type { Env, CitedBriefing } from "../types.js";
import { embed, storeMemory } from "../memory/vectorize.js";

export async function persistBriefing(
  env: Env,
  sessionId: string,
  question: string,
  briefing: CitedBriefing,
): Promise<string> {
  const id = `${sessionId}:${Date.now()}:${cryptoRandom()}`;
  const text = `${question}\n\nTopic: ${briefing.topic}\n\nSummary: ${briefing.summary}`;
  const vector = await embed(env, text);
  await storeMemory(env, id, vector, {
    sessionId,
    topic: briefing.topic,
    summary: briefing.summary,
    question,
    ts: Date.now(),
  });
  return id;
}

function cryptoRandom(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
