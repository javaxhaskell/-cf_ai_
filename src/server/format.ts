import type { CitedBriefing } from "./types.js";

export function formatBriefing(b: CitedBriefing): string {
  const points = b.keyPoints.map((p) => `- ${p}`).join("\n");
  const cites = b.citations
    .slice()
    .sort((a, c) => a.n - c.n)
    .map((c) => `[${c.n}] ${c.title} — ${c.url}`)
    .join("\n");
  return [
    `### ${b.topic}`,
    "",
    b.summary,
    "",
    "**Key points**",
    points,
    "",
    "**Sources**",
    cites,
    "",
    `_confidence: ${b.confidence}_`,
  ].join("\n");
}
