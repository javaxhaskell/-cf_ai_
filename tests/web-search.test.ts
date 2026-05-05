import { describe, it, expect } from "vitest";
import { parseDuckDuckGoHtml } from "../src/server/tools/web-search.js";

const sampleHtml = `
<html><body>
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FSQLite">SQLite — Wikipedia</a>
  <a class="result__snippet">SQLite is a C-language library that implements a small, fast, self-contained SQL database engine.</a>
</div>
<div class="result">
  <a class="result__a" href="https://www.sqlite.org/whyusesqlite.html">Why use SQLite</a>
  <a class="result__snippet">SQLite is the most widely deployed and used database engine in the world.</a>
</div>
</body></html>
`;

describe("parseDuckDuckGoHtml", () => {
  it("extracts hits and unwraps duckduckgo redirect URLs", () => {
    const hits = parseDuckDuckGoHtml(sampleHtml, 5);
    expect(hits).toHaveLength(2);
    expect(hits[0]?.url).toBe("https://en.wikipedia.org/wiki/SQLite");
    expect(hits[0]?.title).toContain("SQLite");
    expect(hits[0]?.snippet).toContain("self-contained");
    expect(hits[1]?.url).toBe("https://www.sqlite.org/whyusesqlite.html");
  });

  it("respects the limit", () => {
    const hits = parseDuckDuckGoHtml(sampleHtml, 1);
    expect(hits).toHaveLength(1);
  });

  it("returns empty for empty html", () => {
    expect(parseDuckDuckGoHtml("", 5)).toHaveLength(0);
  });
});
