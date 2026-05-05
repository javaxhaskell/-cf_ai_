import { describe, it, expect, vi } from "vitest";
import {
  newBriefingId,
  saveBriefing,
  loadBriefing,
  briefingHtml,
} from "../src/server/briefings.js";
import type { Env, CitedBriefing } from "../src/server/types.js";

function makeKvEnv() {
  const store = new Map<string, string>();
  const env = {
    PREFS: {
      get: vi.fn(async (key: string, type?: string) => {
        const raw = store.get(key);
        if (!raw) return null;
        return type === "json" ? JSON.parse(raw) : raw;
      }),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    },
  } as unknown as Env;
  return { env, store };
}

const sampleBriefing: CitedBriefing = {
  topic: "Edge SQL",
  summary: "Edge SQL stores data near users for lower latency.",
  keyPoints: ["Postgres scales [1]", "SQLite is embedded [2]"],
  citations: [
    { n: 1, url: "https://www.postgresql.org/", title: "PostgreSQL" },
    { n: 2, url: "https://www.sqlite.org/", title: "SQLite" },
  ],
  confidence: "medium",
};

describe("newBriefingId", () => {
  it("generates a short alphanumeric id", () => {
    const id = newBriefingId();
    expect(id).toMatch(/^[a-z0-9]+$/);
    expect(id.length).toBeLessThanOrEqual(12);
  });

  it("is non-deterministic", () => {
    const a = newBriefingId();
    const b = newBriefingId();
    expect(a).not.toBe(b);
  });
});

describe("saveBriefing / loadBriefing", () => {
  it("round-trips a briefing through KV", async () => {
    const { env, store } = makeKvEnv();
    const id = await saveBriefing(env, "What is Edge SQL?", sampleBriefing);
    expect(store.size).toBe(1);
    const loaded = await loadBriefing(env, id);
    expect(loaded?.briefing.topic).toBe("Edge SQL");
    expect(loaded?.question).toBe("What is Edge SQL?");
  });

  it("rejects malformed ids", async () => {
    const { env } = makeKvEnv();
    expect(await loadBriefing(env, "../../etc/passwd")).toBeNull();
    expect(await loadBriefing(env, "TOO_LONG_AND_HAS_UNDERSCORES_HERE")).toBeNull();
  });

  it("returns null when key is missing", async () => {
    const { env } = makeKvEnv();
    expect(await loadBriefing(env, "abc123")).toBeNull();
  });
});

describe("briefingHtml", () => {
  it("renders HTML with topic, summary, points, sources, OG meta", () => {
    const html = briefingHtml({
      id: "abc123",
      ts: Date.UTC(2026, 0, 1),
      question: "What is Edge SQL?",
      briefing: sampleBriefing,
    });
    expect(html).toContain("<title>Edge SQL — Clarity</title>");
    expect(html).toContain('property="og:title"');
    expect(html).toContain("Postgres scales");
    expect(html).toContain("https://www.sqlite.org/");
    expect(html).toContain("confidence: medium");
  });

  it("escapes HTML in user-controlled fields (XSS guard)", () => {
    const evil: CitedBriefing = {
      topic: "<script>alert('xss')</script>",
      summary: "Long enough summary text here for testing purposes.",
      keyPoints: ["normal [1]"],
      citations: [{ n: 1, url: "https://x.test/", title: "</title><script>x</script>" }],
      confidence: "low",
    };
    const html = briefingHtml({
      id: "z",
      ts: 0,
      question: "<img onerror=alert(1)>",
      briefing: evil,
    });
    expect(html).not.toMatch(/<script>alert/);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });
});
