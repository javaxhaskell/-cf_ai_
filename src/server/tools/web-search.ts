import type { Env, SearchHit } from "../types.js";

const USER_AGENT = "cf_ai_clarity/0.1 (+https://github.com/example/cf_ai_clarity)";

export async function webSearch(env: Env, query: string, limit = 5): Promise<SearchHit[]> {
  if (env.BRAVE_API_KEY) {
    try {
      return await searchBrave(env.BRAVE_API_KEY, query, limit);
    } catch (err) {
      console.warn("brave search failed, falling back", err);
    }
  }
  try {
    return await searchDuckDuckGo(query, limit);
  } catch (err) {
    console.warn("duckduckgo search failed", err);
    return [];
  }
}

async function searchBrave(key: string, query: string, limit: number): Promise<SearchHit[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(limit));
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": key,
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) throw new Error(`brave search ${res.status}`);
  const data = (await res.json()) as {
    web?: { results?: { title: string; url: string; description: string }[] };
  };
  return (data.web?.results ?? []).slice(0, limit).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: stripTags(r.description),
  }));
}

async function searchDuckDuckGo(query: string, limit: number): Promise<SearchHit[]> {
  const url = new URL("https://duckduckgo.com/html/");
  url.searchParams.set("q", query);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`duckduckgo ${res.status}`);
  const html = await res.text();
  return parseDuckDuckGoHtml(html, limit);
}

export function parseDuckDuckGoHtml(html: string, limit: number): SearchHit[] {
  const hits: SearchHit[] = [];
  const resultRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  const urls: { url: string; title: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = resultRe.exec(html)) !== null && urls.length < limit) {
    const rawHref = m[1] ?? "";
    const url = unwrapDuckDuckGoUrl(rawHref);
    const title = stripTags(m[2] ?? "").trim();
    if (url && title) urls.push({ url, title });
  }
  let i = 0;
  while ((m = snippetRe.exec(html)) !== null && i < urls.length) {
    const item = urls[i];
    if (item) {
      hits.push({ title: item.title, url: item.url, snippet: stripTags(m[1] ?? "").trim() });
    }
    i += 1;
  }
  while (hits.length < urls.length) {
    const item = urls[hits.length];
    if (!item) break;
    hits.push({ title: item.title, url: item.url, snippet: "" });
  }
  return hits.slice(0, limit);
}

function unwrapDuckDuckGoUrl(href: string): string | null {
  if (href.startsWith("//duckduckgo.com/l/?")) {
    try {
      const u = new URL("https:" + href);
      const target = u.searchParams.get("uddg");
      if (target) return decodeURIComponent(target);
    } catch {
      return null;
    }
  }
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
}
