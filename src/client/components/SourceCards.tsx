import type { ClientCitedBriefing } from "../types.js";

type Props = {
  briefing: ClientCitedBriefing;
  permalinkId: string | null;
};

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function faviconFor(u: string): string {
  const host = hostOf(u);
  if (!host) return "";
  return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
}

export function SourceCards({ briefing, permalinkId }: Props) {
  const sorted = briefing.citations.slice().sort((a, b) => a.n - b.n);

  function copyMarkdown() {
    const md = renderBriefingMarkdown(briefing, permalinkId);
    void navigator.clipboard.writeText(md);
  }

  function copyJson() {
    void navigator.clipboard.writeText(JSON.stringify(briefing, null, 2));
  }

  function copyPermalink() {
    if (!permalinkId) return;
    const link = `${window.location.origin}/b/${permalinkId}`;
    void navigator.clipboard.writeText(link);
  }

  return (
    <section
      aria-label="Briefing sources and exports"
      className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4"
    >
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-200">Sources</h2>
        <span
          className={`text-[10px] tracking-wide uppercase rounded-full border px-1.5 py-0.5 ${
            briefing.confidence === "high"
              ? "border-emerald-400/40 text-emerald-300 bg-emerald-400/10"
              : briefing.confidence === "medium"
                ? "border-amber-300/40 text-amber-200 bg-amber-300/10"
                : "border-red-400/40 text-red-300 bg-red-400/10"
          }`}
        >
          {briefing.confidence}
        </span>
      </header>

      <ol className="space-y-2">
        {sorted.map((c) => {
          const host = hostOf(c.url);
          return (
            <li key={c.n}>
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 rounded-md border border-zinc-800/80 bg-zinc-900/40 p-2 hover:border-zinc-600 transition group"
              >
                <span className="text-[10px] mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-clarity-accent/40 bg-clarity-accent/10 text-clarity-accent-soft tabular-nums">
                  {c.n}
                </span>
                {host ? (
                  <img
                    src={faviconFor(c.url)}
                    alt=""
                    width={16}
                    height={16}
                    loading="lazy"
                    className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-sm bg-zinc-800"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-zinc-100 truncate group-hover:text-clarity-accent-soft" title={c.title}>
                    {c.title}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate">{host}</div>
                </div>
              </a>
            </li>
          );
        })}
      </ol>

      <footer className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyMarkdown}
          className="text-[11px] rounded-md border border-zinc-700 px-2 py-1 text-zinc-300 hover:border-zinc-500"
        >
          📋 copy markdown
        </button>
        <button
          type="button"
          onClick={copyJson}
          className="text-[11px] rounded-md border border-zinc-700 px-2 py-1 text-zinc-300 hover:border-zinc-500"
        >
          {} copy JSON
        </button>
        {permalinkId ? (
          <>
            <button
              type="button"
              onClick={copyPermalink}
              className="text-[11px] rounded-md border border-zinc-700 px-2 py-1 text-zinc-300 hover:border-zinc-500"
            >
              🔗 copy permalink
            </button>
            <a
              href={`/b/${permalinkId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] rounded-md border border-clarity-accent/40 bg-clarity-accent/10 px-2 py-1 text-clarity-accent-soft hover:border-clarity-accent"
            >
              ↗ open
            </a>
          </>
        ) : null}
      </footer>
    </section>
  );
}

function renderBriefingMarkdown(b: ClientCitedBriefing, permalinkId: string | null): string {
  const points = b.keyPoints.map((p) => `- ${p}`).join("\n");
  const cites = b.citations
    .slice()
    .sort((a, c) => a.n - c.n)
    .map((c) => `[${c.n}] ${c.title} — ${c.url}`)
    .join("\n");
  const link = permalinkId ? `\n\n_permalink: ${window.location.origin}/b/${permalinkId}_` : "";
  return `### ${b.topic}\n\n${b.summary}\n\n**Key points**\n${points}\n\n**Sources**\n${cites}\n\n_confidence: ${b.confidence}_${link}`;
}
