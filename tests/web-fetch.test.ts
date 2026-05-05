import { describe, it, expect } from "vitest";
import { extractTitle, extractReadableText, isAllowedUrl } from "../src/server/tools/web-fetch.js";
import type { Env } from "../src/server/types.js";

function fakeEnv(): Env {
  return {
    FETCH_ALLOWLIST: "en.wikipedia.org,docs.python.org,developers.cloudflare.com",
  } as unknown as Env;
}

describe("isAllowedUrl", () => {
  const env = fakeEnv();
  it("allows exact host", () => {
    expect(isAllowedUrl(env, "https://en.wikipedia.org/wiki/SQLite")).toBe(true);
  });

  it("allows subdomain of allowlisted host", () => {
    expect(isAllowedUrl(env, "https://blog.developers.cloudflare.com/x")).toBe(true);
  });

  it("rejects non-allowlisted host", () => {
    expect(isAllowedUrl(env, "https://evil.example.com/")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isAllowedUrl(env, "not a url")).toBe(false);
  });
});

describe("extractTitle", () => {
  it("pulls a clean title", () => {
    const html = "<html><head><title>Hello — World</title></head><body>x</body></html>";
    expect(extractTitle(html)).toBe("Hello — World");
  });

  it("returns empty when no title", () => {
    expect(extractTitle("<html><body>x</body></html>")).toBe("");
  });
});

describe("extractReadableText", () => {
  it("strips scripts, styles, headers, footers, navs", () => {
    const html = `
      <html><body>
        <header>navigation here</header>
        <nav>menu</nav>
        <script>window.tracking = 1;</script>
        <style>.foo { color: red }</style>
        <main><p>The main content of the article.</p></main>
        <footer>copyright</footer>
      </body></html>`;
    const text = extractReadableText(html);
    expect(text).toContain("main content of the article");
    expect(text).not.toContain("tracking");
    expect(text).not.toContain("copyright");
    expect(text).not.toContain("color: red");
  });

  it("decodes common HTML entities", () => {
    const html = "<html><body>A &amp; B &lt;c&gt; &quot;d&quot;</body></html>";
    expect(extractReadableText(html)).toBe('A & B <c> "d"');
  });

  it("truncates very long text", () => {
    const big = "<html><body>" + "word ".repeat(10_000) + "</body></html>";
    expect(extractReadableText(big).length).toBeLessThanOrEqual(12_000);
  });
});
