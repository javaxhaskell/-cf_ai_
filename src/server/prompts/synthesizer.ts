import { z } from "zod";
import type { SourceSummary, RecalledMemory } from "../types.js";

export const BriefingSchema = z.object({
  topic: z.string().min(1),
  summary: z.string().min(20),
  keyPoints: z.array(z.string().min(1)).min(2).max(8),
  citations: z
    .array(
      z.object({
        n: z.number().int().positive(),
        url: z.string().url(),
        title: z.string().min(1),
      }),
    )
    .min(1),
  confidence: z.enum(["low", "medium", "high"]),
});

export type BriefingParsed = z.infer<typeof BriefingSchema>;

export const SYNTHESIZER_SYSTEM = `You are the Synthesizer stage of a research pipeline.
You receive per-source summaries and produce a final cited briefing.

Output strict JSON matching this TypeScript type:
{
  "topic": string,
  "summary": string,                                          // 2-4 sentences
  "keyPoints": string[],                                      // 2-8 bullets, each with [n] citations
  "citations": { "n": number, "url": string, "title": string }[],
  "confidence": "low" | "medium" | "high"
}

Rules:
- Output ONLY the JSON object. No prose, no code fences.
- Every keyPoint MUST contain at least one inline citation in the form [n].
- Citation numbers in keyPoints must match entries in the citations array.
- Do not invent URLs. Use only URLs from the provided sources.
- If sources disagree, prefer cautious language and lower confidence.`;

export function buildSynthesizerPrompt(
  question: string,
  topic: string,
  summaries: SourceSummary[],
  recalled: RecalledMemory[],
): string {
  const numbered = summaries
    .map(
      (s, i) =>
        `[${i + 1}] ${s.title}\n  url: ${s.url}\n  bullets:\n  - ${s.bullets.join("\n  - ")}`,
    )
    .join("\n\n");
  const recallBlock =
    recalled.length > 0
      ? `\n\nPrior context (from earlier sessions, may or may not be relevant):\n${recalled
          .map((r) => `- (${r.topic}) ${r.summary}`)
          .join("\n")}`
      : "";
  return `User question:\n${question}\n\nTopic: ${topic}\n\nSources:\n${numbered}${recallBlock}\n\nReturn the JSON briefing now. Use [1], [2], ... matching the source numbers above.`;
}

export function tryParseBriefing(raw: string): BriefingParsed | null {
  const cleaned = stripFences(raw).trim();
  try {
    const parsed = JSON.parse(cleaned);
    const result = BriefingSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      const result = BriefingSchema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }
}

function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}
