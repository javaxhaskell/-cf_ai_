import { z } from "zod";

export const ResearchPlanSchema = z.object({
  topic: z.string().min(1),
  questions: z.array(z.string().min(1)).min(2).max(6),
  queries: z.array(z.string().min(1)).min(2).max(6),
  expectedAngles: z.array(z.string().min(1)).min(1).max(5),
});

export type ResearchPlanParsed = z.infer<typeof ResearchPlanSchema>;

export const PLANNER_SYSTEM = `You are the Planner stage of a research pipeline.
Your job is to turn a user question into a small, concrete research plan.

Output strict JSON matching this TypeScript type:
{
  "topic": string,           // a 3-8 word topic label
  "questions": string[],     // 2-6 sub-questions to investigate
  "queries": string[],       // 2-6 web search queries (short, keyword-style)
  "expectedAngles": string[] // 1-5 angles or perspectives a good answer should cover
}

Rules:
- Output ONLY the JSON object. No prose, no code fences, no commentary.
- Queries must be diverse (different angles, not synonyms).
- Each query is at most 8 words.`;

export function buildPlannerPrompt(question: string, recalledTopics: string[]): string {
  const recallBlock =
    recalledTopics.length > 0
      ? `\n\nRelated prior research topics (for context only, do not assume contents):\n- ${recalledTopics.join("\n- ")}`
      : "";
  return `User question:\n${question}${recallBlock}\n\nReturn the JSON plan now.`;
}

export function tryParsePlan(raw: string): ResearchPlanParsed | null {
  const cleaned = stripFences(raw).trim();
  try {
    const parsed = JSON.parse(cleaned);
    const result = ResearchPlanSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      const result = ResearchPlanSchema.safeParse(parsed);
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
