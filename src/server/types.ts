import type { UIMessage } from "ai";

export type Env = {
  AI: Ai;
  ASSETS: Fetcher;
  ResearchAgent: DurableObjectNamespace;
  RESEARCH_WORKFLOW: Workflow;
  MEMORY_INDEX: VectorizeIndex;
  PREFS: KVNamespace;
  PRIMARY_MODEL: string;
  FALLBACK_MODEL: string;
  EMBEDDING_MODEL: string;
  AUTO_APPROVE_FETCH: string;
  FETCH_ALLOWLIST: string;
  MEMORY_RECALL_THRESHOLD: string;
  MEMORY_RECALL_TOPK: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  BRAVE_API_KEY?: string;
};

export type ResearchStepName =
  | "queued"
  | "plan"
  | "search"
  | "fetch"
  | "summarize"
  | "critique"
  | "synthesize"
  | "done"
  | "error";

export type ResearchStep = {
  name: ResearchStepName;
  status: "pending" | "running" | "ok" | "error";
  startedAt?: number;
  finishedAt?: number;
  detail?: string;
};

export type ResearchPlan = {
  topic: string;
  questions: string[];
  queries: string[];
  expectedAngles: string[];
};

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
};

export type FetchedSource = {
  url: string;
  title: string;
  text: string;
  fetchedAt: number;
};

export type SourceSummary = {
  url: string;
  title: string;
  bullets: string[];
  relevance: number;
};

export type Critique = {
  unsupportedClaims: string[];
  conflicts: string[];
  confidence: "low" | "medium" | "high";
};

export type CitedBriefing = {
  topic: string;
  summary: string;
  keyPoints: string[];
  citations: { n: number; url: string; title: string }[];
  confidence: "low" | "medium" | "high";
};

export type RecalledMemory = {
  id: string;
  topic: string;
  summary: string;
  ts: number;
  score: number;
};

export type AgentState = {
  activeWorkflowId: string | null;
  steps: ResearchStep[];
  recalledMemoryIds: string[];
  recalledMemories: RecalledMemory[];
  lastBriefing: CitedBriefing | null;
};

export type WorkflowParams = {
  question: string;
  agentId: string;
  sessionId: string;
  recalled: RecalledMemory[];
};

export type ChatMessage = UIMessage;
