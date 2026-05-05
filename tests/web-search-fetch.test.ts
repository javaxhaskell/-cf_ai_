import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { webSearch } from "../src/server/tools/web-search.js";
import { webFetch, FetchDeniedError } from "../src/server/tools/web-fetch.js";
import type { Env } from "../src/server/types.js";

function fakeEnv(extra: Partial<Env> = {}): Env {
  return {
    FETCH_ALLOWLIST: "en.wikipedia.org,docs.python.org",
    ...extra,
  } as unknown as Env;
}

const sampleDDG = `
<a class="result__a" href="https://en.wikipedia.org/wiki/Edge_computing">Edge computing</a>
<a class="result__snippet">Edge computing is a distributed paradigm.</a>
<a class="result__a" href="https://docs.python.org/3/library/sqlite3.html">SQLite — Python docs</a>
<a class="result__snippet">SQLite is a C library that provides a lightweight disk-based database.</a>
`;

const samplePage = `
<html>
  <head><title>SQLite — Wikipedia</title></head>
  <body>
    <header>top</header>
    <nav>menu</nav>
    <main><p>SQLite is a small embedded SQL engine. It supports ACID transactions.</p></main>
    <footer>bottom</footer>
  </body>
</html>
`;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("webSearch (DuckDuckGo path)", () => {
  it("fetches DDG and returns parsed hits", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(sampleDDG, { status: 200, headers: { "content-type": "text/html" } }),
    );
    const env = fakeEnv();
    const hits = await webSearch(env, "edge computing", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.url).toContain("wikipedia.org");
  });

  it("returns [] when DDG fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("err", { status: 500 }),
    );
    const env = fakeEnv();
    const hits = await webSearch(env, "x", 5);
    expect(hits).toEqual([]);
  });

  it("uses Brave when BRAVE_API_KEY is set", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          web: {
            results: [
              { title: "T", url: "https://en.wikipedia.org/wiki/X", description: "d" },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const env = fakeEnv({ BRAVE_API_KEY: "test-key" });
    const hits = await webSearch(env, "q", 3);
    expect(hits[0]?.title).toBe("T");
  });

  it("falls back to DDG when Brave fails", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) return new Response("nope", { status: 401 });
      return new Response(sampleDDG, { status: 200 });
    });
    const env = fakeEnv({ BRAVE_API_KEY: "bad-key" });
    const hits = await webSearch(env, "q", 3);
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe("webFetch", () => {
  it("rejects URLs not on the allowlist", async () => {
    const env = fakeEnv();
    await expect(webFetch(env, "https://evil.example.com/x")).rejects.toBeInstanceOf(
      FetchDeniedError,
    );
  });

  it("throws on non-2xx responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 404 }));
    const env = fakeEnv();
    await expect(webFetch(env, "https://en.wikipedia.org/wiki/X")).rejects.toThrow(/404/);
  });

  it("fetches an allowed URL and extracts title + readable text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(samplePage, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    const env = fakeEnv();
    const src = await webFetch(env, "https://en.wikipedia.org/wiki/SQLite");
    expect(src.title).toBe("SQLite — Wikipedia");
    expect(src.text).toContain("SQLite is a small embedded SQL engine");
    expect(src.text).not.toContain("menu");
    expect(src.fetchedAt).toBeGreaterThan(0);
  });
});
