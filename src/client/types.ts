export type ClientStepName =
  | "queued"
  | "plan"
  | "search"
  | "fetch"
  | "summarize"
  | "critique"
  | "synthesize"
  | "done"
  | "error";

export type ClientStep = {
  name: ClientStepName;
  status: "pending" | "running" | "ok" | "error";
  startedAt?: number;
  finishedAt?: number;
  detail?: string;
};

export type ClientRecalledMemory = {
  id: string;
  topic: string;
  summary: string;
  ts: number;
  score: number;
};

export type ClientCitedBriefing = {
  topic: string;
  summary: string;
  keyPoints: string[];
  citations: { n: number; url: string; title: string }[];
  confidence: "low" | "medium" | "high";
};

export type ClientAgentState = {
  activeWorkflowId: string | null;
  steps: ClientStep[];
  recalledMemoryIds: string[];
  recalledMemories: ClientRecalledMemory[];
  lastBriefing: ClientCitedBriefing | null;
};

export const STEP_LABELS: Record<ClientStepName, string> = {
  queued: "Queued",
  plan: "Plan",
  search: "Search",
  fetch: "Fetch",
  summarize: "Summarize",
  critique: "Critique",
  synthesize: "Synthesize",
  done: "Done",
  error: "Error",
};
