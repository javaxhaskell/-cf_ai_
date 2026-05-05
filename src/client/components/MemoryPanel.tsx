import type { ClientRecalledMemory } from "../types.js";

type Props = {
  memories: ClientRecalledMemory[];
};

export function MemoryPanel({ memories }: Props) {
  return (
    <section
      aria-label="Recalled prior memories"
      className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4"
    >
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Recalled memory</h2>
        <span className="text-[10px] text-zinc-500">{memories.length} match{memories.length === 1 ? "" : "es"}</span>
      </header>
      {memories.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">
          No related prior briefings. New memory will be stored after each research run.
        </p>
      ) : (
        <ul className="space-y-3">
          {memories.map((m) => (
            <li
              key={m.id}
              className="rounded-md border border-zinc-800/80 bg-zinc-900/40 p-3 text-xs text-zinc-300"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-zinc-100 truncate" title={m.topic}>
                  {m.topic}
                </span>
                <span className="text-[10px] text-clarity-accent-soft tabular-nums">
                  {m.score.toFixed(2)}
                </span>
              </div>
              <p className="mt-1 text-zinc-400 line-clamp-3">{m.summary}</p>
              <time className="mt-1 block text-[10px] text-zinc-600">
                {new Date(m.ts).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
