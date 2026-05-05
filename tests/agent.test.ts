import { describe, it, expect } from "vitest";
import { formatBriefing } from "../src/server/format.js";
import type { CitedBriefing } from "../src/server/types.js";

describe("formatBriefing", () => {
  it("produces a markdown briefing with topic, summary, points, and sources", () => {
    const briefing: CitedBriefing = {
      topic: "Edge SQL",
      summary: "Edge SQL stores data near users for lower latency.",
      keyPoints: ["Postgres scales horizontally [1]", "SQLite is embedded [2]"],
      citations: [
        { n: 1, url: "https://www.postgresql.org/", title: "PostgreSQL" },
        { n: 2, url: "https://www.sqlite.org/", title: "SQLite" },
      ],
      confidence: "medium",
    };
    const md = formatBriefing(briefing);
    expect(md).toContain("### Edge SQL");
    expect(md).toContain("Edge SQL stores data");
    expect(md).toContain("- Postgres scales horizontally [1]");
    expect(md).toContain("[1] PostgreSQL");
    expect(md).toContain("[2] SQLite");
    expect(md).toContain("confidence: medium");
  });

  it("orders citations by n", () => {
    const briefing: CitedBriefing = {
      topic: "T",
      summary: "Summary text long enough.",
      keyPoints: ["a [2]", "b [1]"],
      citations: [
        { n: 2, url: "https://b.example/", title: "B" },
        { n: 1, url: "https://a.example/", title: "A" },
      ],
      confidence: "low",
    };
    const md = formatBriefing(briefing);
    const aIdx = md.indexOf("[1] A");
    const bIdx = md.indexOf("[2] B");
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(aIdx);
  });
});
