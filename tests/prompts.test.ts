import { describe, it, expect } from "vitest";
import { tryParsePlan } from "../src/server/prompts/planner.js";
import { tryParseBriefing } from "../src/server/prompts/synthesizer.js";
import { tryParseCritique } from "../src/server/prompts/critic.js";
import { tryParseSourceSummary } from "../src/server/prompts/summarizer.js";
import { tryParseIntent, heuristicIntent } from "../src/server/prompts/intent.js";

describe("planner parser", () => {
  it("parses a clean JSON plan", () => {
    const raw = JSON.stringify({
      topic: "Edge databases",
      questions: ["What is edge SQL?", "Why does it matter?"],
      queries: ["edge sql databases", "sqlite at the edge"],
      expectedAngles: ["latency", "consistency"],
    });
    const out = tryParsePlan(raw);
    expect(out).not.toBeNull();
    expect(out?.topic).toBe("Edge databases");
    expect(out?.queries).toHaveLength(2);
  });

  it("recovers JSON wrapped in markdown fences", () => {
    const raw =
      "```json\n" +
      JSON.stringify({
        topic: "X",
        questions: ["a", "b"],
        queries: ["q1", "q2"],
        expectedAngles: ["a"],
      }) +
      "\n```";
    expect(tryParsePlan(raw)).not.toBeNull();
  });

  it("recovers JSON embedded in prose", () => {
    const raw =
      'Here is the plan you asked for:\n{"topic":"T","questions":["a","b"],"queries":["x","y"],"expectedAngles":["z"]}\nHope it helps.';
    const out = tryParsePlan(raw);
    expect(out?.topic).toBe("T");
  });

  it("rejects malformed plans", () => {
    expect(tryParsePlan("not json")).toBeNull();
    expect(tryParsePlan('{"topic":"x"}')).toBeNull();
  });
});

describe("synthesizer parser", () => {
  it("parses a valid briefing", () => {
    const raw = JSON.stringify({
      topic: "T",
      summary:
        "This is a summary that has more than twenty characters to satisfy minimum length validation.",
      keyPoints: ["Point one [1]", "Point two [2]"],
      citations: [
        { n: 1, url: "https://example.com/a", title: "A" },
        { n: 2, url: "https://example.com/b", title: "B" },
      ],
      confidence: "medium",
    });
    const out = tryParseBriefing(raw);
    expect(out?.confidence).toBe("medium");
    expect(out?.citations).toHaveLength(2);
  });

  it("rejects bad confidence value", () => {
    const raw = JSON.stringify({
      topic: "T",
      summary: "Long enough summary text here for validation purposes.",
      keyPoints: ["a", "b"],
      citations: [{ n: 1, url: "https://x.com", title: "X" }],
      confidence: "very-high",
    });
    expect(tryParseBriefing(raw)).toBeNull();
  });

  it("rejects non-URL citations", () => {
    const raw = JSON.stringify({
      topic: "T",
      summary: "Long enough summary text here for validation purposes.",
      keyPoints: ["a", "b"],
      citations: [{ n: 1, url: "not-a-url", title: "X" }],
      confidence: "high",
    });
    expect(tryParseBriefing(raw)).toBeNull();
  });
});

describe("critique parser", () => {
  it("parses an empty-array critique", () => {
    const raw = JSON.stringify({
      unsupportedClaims: [],
      conflicts: [],
      confidence: "high",
    });
    expect(tryParseCritique(raw)?.confidence).toBe("high");
  });
});

describe("source summary parser", () => {
  it("parses a valid summary with relevance", () => {
    const raw = JSON.stringify({
      bullets: ["fact one", "fact two"],
      relevance: 0.8,
    });
    const out = tryParseSourceSummary(raw);
    expect(out?.relevance).toBe(0.8);
    expect(out?.bullets).toHaveLength(2);
  });

  it("rejects relevance out of range", () => {
    const raw = JSON.stringify({ bullets: ["a", "b"], relevance: 1.5 });
    expect(tryParseSourceSummary(raw)).toBeNull();
  });
});

describe("intent classifier", () => {
  it("parses LLM intent JSON", () => {
    const out = tryParseIntent('{"intent":"research","reason":"web question"}');
    expect(out?.intent).toBe("research");
  });

  it("classifies short greetings as chitchat (heuristic)", () => {
    expect(heuristicIntent("hi").intent).toBe("chitchat");
    expect(heuristicIntent("hello there").intent).toBe("chitchat");
    expect(heuristicIntent("thanks").intent).toBe("chitchat");
  });

  it("classifies real questions as research (heuristic)", () => {
    expect(heuristicIntent("what is the difference between A and B?").intent).toBe("research");
    expect(heuristicIntent("compare postgres and sqlite for edge use").intent).toBe("research");
  });
});
