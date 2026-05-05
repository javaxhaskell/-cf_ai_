import type { Env, FetchedSource } from "../types.js";

const USER_AGENT = "cf_ai_clarity/0.1 (+https://github.com/example/cf_ai_clarity)";
const MAX_BYTES = 600_000;

export class FetchDeniedError extends Error {
  constructor(public readonly host: string) {
    super(`fetch denied: ${host} not in allowlist`);
    this.name = "FetchDeniedError";
  }
}

export function isAllowedUrl(env: Env, url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const allowList = env.FETCH_ALLOWLIST.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowList.some((entry) => host === entry || host.endsWith("." + entry));
}

export async function webFetch(env: Env, url: string): Promise<FetchedSource> {
  if (!isAllowedUrl(env, url)) {
    throw new FetchDeniedError(new URL(url).hostname);
  }
  if (env.BROWSER) {
    try {
      return await fetchViaBrowserRendering(env, url);
    } catch (err) {
      console.warn("browser rendering failed, falling back to plain fetch", err);
    }
  }
  return fetchPlain(url);
}

async function fetchPlain(url: string): Promise<FetchedSource> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`fetch ${url} → ${res.status}`);
  }
  const buffer = await readLimited(res, MAX_BYTES);
  const html = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const title = extractTitle(html);
  const text = extractReadableText(html);
  return {
    url,
    title: title || url,
    text,
    fetchedAt: Date.now(),
  };
}

async function fetchViaBrowserRendering(env: Env, url: string): Promise<FetchedSource> {
  if (!env.BROWSER) throw new Error("BROWSER binding not configured");
  const res = await env.BROWSER.fetch("https://browser/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, waitUntil: "networkidle0", screenshot: false }),
  });
  if (!res.ok) {
    throw new Error(`browser render ${url} → ${res.status}`);
  }
  const data = (await res.json()) as { html?: string; title?: string };
  const html = data.html ?? "";
  if (!html) throw new Error("browser render returned empty html");
  return {
    url,
    title: data.title ?? extractTitle(html) ?? url,
    text: extractReadableText(html),
    fetchedAt: Date.now(),
  };
}

async function readLimited(res: Response, max: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < max) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const out = new Uint8Array(Math.min(total, max));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= max) break;
    const take = Math.min(chunk.byteLength, max - offset);
    out.set(chunk.subarray(0, take), offset);
    offset += take;
  }
  return out;
}

export function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(stripTags(m[1] ?? "").trim()) : "";
}

export function extractReadableText(html: string): string {
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<header[\s\S]*?<\/header>/gi, " ");
  s = s.replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  s = s.replace(/<aside[\s\S]*?<\/aside>/gi, " ");
  s = s.replace(/<form[\s\S]*?<\/form>/gi, " ");
  s = stripTags(s);
  s = decodeEntities(s);
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, 12_000);
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}
