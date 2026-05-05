import { describe, it, expect } from "vitest";
import { tryParseCritique, CRITIC_SYSTEM, buildCriticPrompt } from "../src/server/prompts/critic.js";
import {
  tryParseBriefing,
  SYNTHESIZER_SYSTEM,
  buildSynthesizerPrompt,
} from "../src/server/prompts/synthesizer.js";
import { tryParsePlan, PLANNER_SYSTEM, buildPlannerPrompt } from "../src/server/prompts/planner.js";
import {
  tryParseSourceSummary,
  buildSummarizerPrompt,
  SUMMARIZER_SYSTEM,
} from "../src/server/prompts/summarizer.js";
import { tryParseIntent, buildIntentPrompt, INTENT_SYSTEM } from "../src/server/prompts/intent.js";

describe("critic parser edge cases", () => {
  it("parses fenced JSON", () => {
    const raw = "```json\n" + JSON.stringify({ unsupportedClaims: [], conflicts: [], confidence: "low" }) + "\n```";
    expect(tryParseCritique(raw)?.confidence).toBe("low");
  });
  it("recovers JSON inside prose", () => {
    const raw = 'noise {"unsupportedClaims":["x"],"conflicts":[],"confidence":"medium"} end';
    expect(tryParseCritique(raw)?.unsupportedClaims).toEqual(["x"]);
  });
  it("rejects garbage", () => {
    expect(tryParseCritique("nope")).toBeNull();
    expect(tryParseCritique("{not parseable")).toBeNull();
  });
  it("rejects bad confidence enum", () => {
    expect(
      tryParseCritique(JSON.stringify({ unsupportedClaims: [], conflicts: [], confidence: "x" })),
    ).toBeNull();
  });

  it("buildCriticPrompt embeds source bullets", () => {
    const prompt = buildCriticPrompt("q?", [
      { url: "https://a.example/", title: "A", bullets: ["b1", "b2"], relevance: 0.5 },
    ]);
    expect(prompt).toContain("[1] A (https://a.example/)");
    expect(prompt).toContain("- b1");
    expect(CRITIC_SYSTEM.length).toBeGreaterThan(40);
  });
});

describe("synthesizer parser edge cases", () => {
  it("recovers JSON in prose", () => {
    const raw =
      "Here's the briefing:\n" +
      JSON.stringify({
        topic: "T",
        summary: "Long enough summary to satisfy minimum length validation rules.",
        keyPoints: ["a [1]", "b [1]"],
        citations: [{ n: 1, url: "https://example.com", title: "E" }],
        confidence: "high",
      }) +
      "\nDone.";
    expect(tryParseBriefing(raw)?.confidence).toBe("high");
  });

  it("rejects malformed JSON", () => {
    expect(tryParseBriefing("not json")).toBeNull();
    expect(tryParseBriefing("{broken")).toBeNull();
  });

  it("rejects missing citations", () => {
    const raw = JSON.stringify({
      topic: "T",
      summary: "Long enough summary to satisfy minimum length validation rules.",
      keyPoints: ["a", "b"],
      citations: [],
      confidence: "high",
    });
    expect(tryParseBriefing(raw)).toBeNull();
  });

  it("buildSynthesizerPrompt includes recall block when present", () => {
    const prompt = buildSynthesizerPrompt(
      "q",
      "topic",
      [{ url: "https://x.example", title: "X", bullets: ["fact"], relevance: 1 }],
      [{ id: "m1", topic: "Prior", summary: "Prior summary", ts: 0, score: 0.9 }],
    );
    expect(prompt).toContain("Prior context");
    expect(prompt).toContain("[1] X");
    expect(SYNTHESIZER_SYSTEM.length).toBeGreaterThan(40);
  });

  it("buildSynthesizerPrompt omits recall block when empty", () => {
    const prompt = buildSynthesizerPrompt("q", "topic", [], []);
    expect(prompt).not.toContain("Prior context");
  });
});

describe("planner edge cases", () => {
  it("buildPlannerPrompt embeds recalled topics", () => {
    const prompt = buildPlannerPrompt("question", ["topic-a", "topic-b"]);
    expect(prompt).toContain("Related prior research topics");
    expect(prompt).toContain("topic-a");
    expect(PLANNER_SYSTEM).toContain("Planner");
  });
  it("buildPlannerPrompt omits recall block when empty", () => {
    const prompt = buildPlannerPrompt("question", []);
    expect(prompt).not.toContain("Related prior research topics");
  });
  it("rejects plan with too-few queries", () => {
    expect(
      tryParsePlan(
        JSON.stringify({
          topic: "T",
          questions: ["q1", "q2"],
          queries: ["only"],
          expectedAngles: ["a"],
        }),
      ),
    ).toBeNull();
  });
});

describe("summarizer edge cases", () => {
  it("buildSummarizerPrompt truncates long text and includes title/question", () => {
    const huge = "x".repeat(20_000);
    const prompt = buildSummarizerPrompt("Question?", "Title", huge);
    expect(prompt).toContain("[...truncated]");
    expect(prompt).toContain("Question?");
    expect(prompt).toContain("Title");
    expect(SUMMARIZER_SYSTEM).toContain("Summarizer");
  });
  it("rejects summary with too-few bullets", () => {
    expect(
      tryParseSourceSummary(JSON.stringify({ bullets: ["just one"], relevance: 0.5 })),
    ).toBeNull();
  });
  it("recovers fenced JSON", () => {
    const raw = "```\n" + JSON.stringify({ bullets: ["a", "b"], relevance: 0.4 }) + "\n```";
    expect(tryParseSourceSummary(raw)?.relevance).toBe(0.4);
  });
});

describe("intent edge cases", () => {
  it("buildIntentPrompt and INTENT_SYSTEM are non-empty", () => {
    expect(buildIntentPrompt("hi").length).toBeGreaterThan(8);
    expect(INTENT_SYSTEM).toContain("intent");
  });
  it("rejects malformed intent JSON", () => {
    expect(tryParseIntent("nope")).toBeNull();
    expect(tryParseIntent('{"intent":"banana","reason":"x"}')).toBeNull();
  });
  it("recovers fenced intent JSON", () => {
    const raw = "```json\n" + JSON.stringify({ intent: "chitchat", reason: "hi" }) + "\n```";
    expect(tryParseIntent(raw)?.intent).toBe("chitchat");
  });
});
