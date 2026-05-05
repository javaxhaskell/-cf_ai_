import { z } from "zod";

export const IntentSchema = z.object({
  intent: z.enum(["chitchat", "research"]),
  reason: z.string().max(200),
});

export type IntentParsed = z.infer<typeof IntentSchema>;

export const INTENT_SYSTEM = `You classify a user message into one of two intents:
- "chitchat": greetings, small talk, meta questions about the assistant itself, single-word replies.
- "research": any question that benefits from looking up information on the web.

Output strict JSON: { "intent": "chitchat" | "research", "reason": string }
Output ONLY the JSON object. No prose, no fences.`;

export function buildIntentPrompt(message: string): string {
  return `User message:\n${message}\n\nReturn the JSON classification now.`;
}

export function tryParseIntent(raw: string): IntentParsed | null {
  const cleaned = stripFences(raw).trim();
  try {
    const parsed = JSON.parse(cleaned);
    const r = IntentSchema.safeParse(parsed);
    return r.success ? r.data : null;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      const r = IntentSchema.safeParse(parsed);
      return r.success ? r.data : null;
    } catch {
      return null;
    }
  }
}

export function heuristicIntent(message: string): IntentParsed {
  const trimmed = message.trim().toLowerCase();
  if (trimmed.length < 8) return { intent: "chitchat", reason: "very short message" };
  const greetings = ["hi", "hello", "hey", "thanks", "thank you", "yo", "sup"];
  if (greetings.some((g) => trimmed === g || trimmed.startsWith(g + " ") || trimmed.startsWith(g + ","))) {
    return { intent: "chitchat", reason: "greeting" };
  }
  const researchSignals = ["?", "compare", "explain", "what is", "what are", "why", "how", "best", "difference"];
  if (researchSignals.some((s) => trimmed.includes(s))) {
    return { intent: "research", reason: "research signal in text" };
  }
  return { intent: "research", reason: "default to research" };
}

function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}
