import { AIChatAgent } from "@cloudflare/ai-chat";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import type { Env, AgentState, ResearchStep, CitedBriefing, RecalledMemory } from "./types.js";
import { embed } from "./memory/vectorize.js";
import { runMemoryRecall } from "./tools/memory-recall.js";
import {
  heuristicIntent,
  buildIntentPrompt,
  INTENT_SYSTEM,
  tryParseIntent,
  type IntentParsed,
} from "./prompts/intent.js";
import { runLlm, activeProvider } from "./tools/llm.js";
import { formatBriefing } from "./format.js";

export { formatBriefing };

const INITIAL_STATE: AgentState = {
  activeWorkflowId: null,
  steps: [],
  recalledMemoryIds: [],
  recalledMemories: [],
  lastBriefing: null,
  lastPermalinkId: null,
  provider: "workers-ai",
};

const STEP_ORDER = [
  "queued",
  "plan",
  "search",
  "fetch",
  "summarize",
  "critique",
  "synthesize",
  "done",
] as const;

export class ResearchAgent extends AIChatAgent<Env, AgentState> {
  override initialState: AgentState = INITIAL_STATE;

  override async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/internal/workflow-event" && request.method === "POST") {
      return this.handleWorkflowEvent(request);
    }
    if (url.pathname === "/internal/state" && request.method === "GET") {
      return Response.json(this.state);
    }
    return super.onRequest(request);
  }

  override async onChatMessage(): Promise<Response | undefined> {
    const lastUserText = extractLastUserText(this.messages);
    const intent = await this.classifyIntent(lastUserText);
    const workersai = createWorkersAI({ binding: this.env.AI });
    const modelId = this.env.PRIMARY_MODEL as Parameters<typeof workersai>[0];

    if (intent.intent === "chitchat" || lastUserText.length === 0) {
      const modelMessages = await convertToModelMessages(this.messages);
      const result = streamText({
        model: workersai(modelId),
        system:
          "You are Clarity, a friendly research assistant. The user sent a chitchat message. Reply briefly (1-2 sentences) and remind them you can research questions for them.",
        messages: modelMessages,
      });
      return result.toUIMessageStreamResponse();
    }

    const recalled = await this.recall(lastUserText);
    this.setState({
      ...this.state,
      recalledMemoryIds: recalled.map((r) => r.id),
      recalledMemories: recalled,
      steps: emptySteps(),
      activeWorkflowId: null,
      lastBriefing: null,
    });

    const sessionId = this.name || "default";
    const instance = await this.env.RESEARCH_WORKFLOW.create({
      params: {
        question: lastUserText,
        agentId: sessionId,
        sessionId,
        recalled,
      },
    });

    this.setState({
      ...this.state,
      activeWorkflowId: instance.id,
      provider: activeProvider(this.env),
    });

    const recallNote =
      recalled.length > 0
        ? ` You may briefly note that ${recalled.length} related memory${recalled.length === 1 ? "" : "ies"} from prior sessions have been pulled in.`
        : "";

    const modelMessages = await convertToModelMessages(this.messages);
    const result = streamText({
      model: workersai(modelId),
      system:
        "You are Clarity, a research assistant. The user just asked a research question. " +
        "A multi-step research workflow (plan → search → fetch → summarize → critique → synthesize) has just been started in the background. " +
        "Acknowledge in 2-3 sentences that you're starting research and that the timeline panel will update live. " +
        "Do NOT attempt to answer the question yet — the briefing will be appended when the workflow completes." +
        recallNote,
      messages: modelMessages,
    });
    return result.toUIMessageStreamResponse();
  }

  private async classifyIntent(text: string): Promise<IntentParsed> {
    if (text.trim().length < 8) return heuristicIntent(text);
    try {
      const raw = await runLlm(this.env, {
        system: INTENT_SYSTEM,
        user: buildIntentPrompt(text),
        json: true,
        maxTokens: 80,
        temperature: 0,
      });
      const parsed = tryParseIntent(raw);
      if (parsed) return parsed;
    } catch (err) {
      console.warn("intent classifier failed, using heuristic", err);
    }
    return heuristicIntent(text);
  }

  private async recall(question: string): Promise<RecalledMemory[]> {
    try {
      const topK = Number(this.env.MEMORY_RECALL_TOPK);
      const k = Number.isFinite(topK) ? topK : 5;
      return await runMemoryRecall(this.env, { query: question, topK: k });
    } catch (err) {
      console.warn("memory recall failed", err);
      return [];
    }
  }

  private async handleWorkflowEvent(request: Request): Promise<Response> {
    const body = (await request.json()) as
      | { type: "step"; name: ResearchStep["name"]; status: ResearchStep["status"]; detail?: string }
      | { type: "done"; briefing: CitedBriefing; permalinkId?: string };

    if (body.type === "step") {
      const now = Date.now();
      const existing = this.state.steps.find((s) => s.name === body.name);
      const updated: ResearchStep = {
        name: body.name,
        status: body.status,
        detail: body.detail,
        startedAt: existing?.startedAt ?? (body.status === "running" ? now : undefined),
        finishedAt: body.status === "ok" || body.status === "error" ? now : existing?.finishedAt,
      };
      const steps = mergeSteps(this.state.steps, updated);
      this.setState({ ...this.state, steps });
    } else if (body.type === "done") {
      this.setState({
        ...this.state,
        lastBriefing: body.briefing,
        activeWorkflowId: null,
        lastPermalinkId: body.permalinkId ?? null,
      });
      const text = body.permalinkId
        ? formatBriefing(body.briefing) + `\n\n_permalink: [/b/${body.permalinkId}](/b/${body.permalinkId})_`
        : formatBriefing(body.briefing);
      try {
        const next: UIMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          parts: [{ type: "text", text }],
        };
        await this.persistMessages([...this.messages, next]);
      } catch (err) {
        console.warn("persistMessages on done failed", err);
      }
    }

    return new Response("ok");
  }

  async embed(text: string): Promise<number[]> {
    return embed(this.env, text);
  }
}

function emptySteps(): ResearchStep[] {
  return STEP_ORDER.map((name) => ({ name, status: "pending" }));
}

function mergeSteps(current: ResearchStep[], next: ResearchStep): ResearchStep[] {
  const seed = current.length === 0 ? emptySteps() : current.slice();
  const idx = seed.findIndex((s) => s.name === next.name);
  if (idx === -1) {
    seed.push(next);
  } else {
    seed[idx] = next;
  }
  return seed;
}

function extractLastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg || msg.role !== "user") continue;
    const text = (msg.parts ?? [])
      .filter((p): p is Extract<UIMessage["parts"][number], { type: "text" }> => p.type === "text")
      .map((p) => p.text)
      .join(" ")
      .trim();
    if (text) return text;
  }
  return "";
}

