import { z } from "zod";

export const SourceSummarySchema = z.object({
  bullets: z.array(z.string().min(1)).min(2).max(6),
  relevance: z.number().min(0).max(1),
});

export type SourceSummaryParsed = z.infer<typeof SourceSummarySchema>;

export const SUMMARIZER_SYSTEM = `You are the Summarizer stage of a research pipeline.
You receive a single fetched web page (truncated) and produce a compact summary.

Output strict JSON:
{
  "bullets": string[],   // 2-6 short factual bullets relevant to the question
  "relevance": number    // 0..1, how relevant this source is to the question
}

Rules:
- Output ONLY the JSON object. No prose, no fences.
- Each bullet is a single factual statement, max ~25 words.
- If the page is irrelevant, return relevance < 0.3 and the most factual bullets you can.
- Do not invent facts not present in the source.`;

export function buildSummarizerPrompt(question: string, title: string, text: string): string {
  const truncated = text.length > 8000 ? text.slice(0, 8000) + "\n[...truncated]" : text;
  return `User question:\n${question}\n\nSource title: ${title}\n\nSource text:\n${truncated}\n\nReturn the JSON summary now.`;
}

export function tryParseSourceSummary(raw: string): SourceSummaryParsed | null {
  const cleaned = stripFences(raw).trim();
  try {
    const parsed = JSON.parse(cleaned);
    const result = SourceSummarySchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      const result = SourceSummarySchema.safeParse(parsed);
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
