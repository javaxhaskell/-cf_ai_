import { z } from "zod";
import type { SourceSummary } from "../types.js";

export const CritiqueSchema = z.object({
  unsupportedClaims: z.array(z.string()).max(8),
  conflicts: z.array(z.string()).max(8),
  confidence: z.enum(["low", "medium", "high"]),
});

export type CritiqueParsed = z.infer<typeof CritiqueSchema>;

export const CRITIC_SYSTEM = `You are the Critic stage of a research pipeline.
You receive per-source summaries and assess overall quality.

Output strict JSON matching this TypeScript type:
{
  "unsupportedClaims": string[],   // claims that lack source backing (max 8)
  "conflicts": string[],           // pairs of sources that disagree (max 8)
  "confidence": "low" | "medium" | "high"
}

Rules:
- Output ONLY the JSON object. No prose, no code fences.
- "high" only if at least 2 independent sources agree on the main claim.
- "low" if there is only 1 source or sources conflict on the main claim.
- Empty arrays are valid when nothing applies.`;

export function buildCriticPrompt(question: string, summaries: SourceSummary[]): string {
  const numbered = summaries
    .map(
      (s, i) =>
        `[${i + 1}] ${s.title} (${s.url})\n  - ${s.bullets.join("\n  - ")}`,
    )
    .join("\n\n");
  return `User question:\n${question}\n\nSource summaries:\n${numbered}\n\nReturn the JSON critique now.`;
}

export function tryParseCritique(raw: string): CritiqueParsed | null {
  const cleaned = stripFences(raw).trim();
  try {
    const parsed = JSON.parse(cleaned);
    const result = CritiqueSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      const result = CritiqueSchema.safeParse(parsed);
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
