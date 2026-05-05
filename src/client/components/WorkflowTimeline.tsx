import type { ClientStep, ClientStepName } from "../types.js";
import { STEP_LABELS } from "../types.js";

type Props = {
  steps: ClientStep[];
  activeWorkflowId: string | null;
};

const ORDER: ClientStepName[] = [
  "queued",
  "plan",
  "search",
  "fetch",
  "summarize",
  "critique",
  "synthesize",
  "done",
];

function statusGlyph(status: ClientStep["status"]): string {
  switch (status) {
    case "ok":
      return "✓";
    case "error":
      return "✕";
    case "running":
      return "●";
    default:
      return "○";
  }
}

function statusColor(status: ClientStep["status"]): string {
  switch (status) {
    case "ok":
      return "text-emerald-400 border-emerald-400/40 bg-emerald-400/10";
    case "error":
      return "text-red-400 border-red-400/40 bg-red-400/10";
    case "running":
      return "text-amber-300 border-amber-300/40 bg-amber-300/10 animate-pulse";
    default:
      return "text-zinc-500 border-zinc-700 bg-zinc-900";
  }
}

export function WorkflowTimeline({ steps, activeWorkflowId }: Props) {
  const byName = new Map(steps.map((s) => [s.name, s] as const));
  const renderable = ORDER.map(
    (name): ClientStep => byName.get(name) ?? { name, status: "pending" },
  );
  const errored = steps.find((s) => s.status === "error");
  if (errored && !renderable.some((s) => s.name === "error")) {
    renderable.push(errored);
  }

  return (
    <section
      aria-label="Research workflow timeline"
      className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4"
    >
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Research timeline</h2>
        <TimelineMeta steps={steps} activeWorkflowId={activeWorkflowId} />
      </header>
      <ol className="space-y-2">
        {renderable.map((step) => {
          const ms =
            step.startedAt && step.finishedAt ? step.finishedAt - step.startedAt : undefined;
          return (
            <li key={step.name} className="flex items-start gap-3">
              <span
                className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs ${statusColor(step.status)}`}
                aria-label={step.status}
              >
                {statusGlyph(step.status)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-zinc-200">{STEP_LABELS[step.name]}</span>
                  {ms !== undefined ? (
                    <span className="text-[10px] text-zinc-500">{(ms / 1000).toFixed(1)}s</span>
                  ) : null}
                </div>
                {step.detail ? (
                  <div className="text-xs text-zinc-400 truncate" title={step.detail}>
                    {step.detail}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TimelineMeta({ steps, activeWorkflowId }: { steps: ClientStep[]; activeWorkflowId: string | null }) {
  const earliest = steps.reduce<number | undefined>(
    (m, s) => (s.startedAt ? (m === undefined || s.startedAt < m ? s.startedAt : m) : m),
    undefined,
  );
  const latest = steps.reduce<number | undefined>(
    (m, s) => (s.finishedAt ? (m === undefined || s.finishedAt > m ? s.finishedAt : m) : m),
    undefined,
  );
  const totalMs = earliest && latest && latest >= earliest ? latest - earliest : undefined;
  const isDone = steps.find((s) => s.name === "done")?.status === "ok";

  if (isDone && totalMs !== undefined) {
    return (
      <span
        className="text-[10px] tabular-nums text-emerald-300 bg-emerald-400/10 border border-emerald-400/30 rounded-full px-2 py-0.5"
        title="total elapsed time"
      >
        ✓ {(totalMs / 1000).toFixed(1)}s
      </span>
    );
  }
  if (activeWorkflowId) {
    return (
      <code className="text-[10px] text-zinc-500 truncate max-w-[60%]" title={activeWorkflowId}>
        {activeWorkflowId.slice(0, 18)}…
      </code>
    );
  }
  return <span className="text-[10px] text-zinc-500">idle</span>;
}
