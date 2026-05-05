import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import { ChatPane } from "./components/ChatPane.js";
import { WorkflowTimeline } from "./components/WorkflowTimeline.js";
import { MemoryPanel } from "./components/MemoryPanel.js";
import { SourceCards } from "./components/SourceCards.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { ErrorToast } from "./components/ErrorToast.js";
import type { ClientAgentState } from "./types.js";
import { speak } from "./hooks/useVoice.js";

const DEFAULT_STATE: ClientAgentState = {
  activeWorkflowId: null,
  steps: [],
  recalledMemoryIds: [],
  recalledMemories: [],
  lastBriefing: null,
  lastPermalinkId: null,
  provider: "workers-ai",
};

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "default";
  const KEY = "clarity:session";
  const existing = window.localStorage.getItem(KEY);
  if (existing) return existing;
  const id = `s-${crypto.randomUUID().slice(0, 8)}`;
  window.localStorage.setItem(KEY, id);
  return id;
}

export default function App() {
  const sessionId = useMemo(() => getOrCreateSessionId(), []);
  const [agentState, setAgentState] = useState<ClientAgentState>(DEFAULT_STATE);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSpokenRef = useRef<string | null>(null);

  const agent = useAgent<ClientAgentState>({
    agent: "research-agent",
    name: sessionId,
    onStateUpdate: (state) => {
      if (state) setAgentState({ ...DEFAULT_STATE, ...state });
    },
  });

  const { messages, sendMessage, clearHistory, status, isStreaming } = useAgentChat({
    agent,
  });

  useEffect(() => {
    const errored = agentState.steps.find((s) => s.status === "error");
    if (errored) {
      setError(`${errored.name}: ${errored.detail ?? "step failed"}`);
    }
  }, [agentState.steps]);

  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      void sendMessage({ text: trimmed });
    },
    [sendMessage],
  );

  const handleClear = useCallback(() => {
    clearHistory();
    setAgentState(DEFAULT_STATE);
    setError(null);
  }, [clearHistory]);

  useEffect(() => {
    if (!ttsEnabled) return;
    const last = messages.at(-1);
    if (!last || last.role !== "assistant") return;
    const text = (last.parts ?? [])
      .filter((p): p is Extract<UIMessage["parts"][number], { type: "text" }> => p.type === "text")
      .map((p) => p.text)
      .join(" ")
      .trim();
    if (!text) return;
    if (lastSpokenRef.current === last.id) return;
    if (status === "streaming") return;
    lastSpokenRef.current = last.id;
    const trimmed = text.length > 600 ? text.slice(0, 600) + "…" : text;
    speak(trimmed);
  }, [messages, status, ttsEnabled]);

  return (
    <div className="mx-auto flex h-screen max-w-7xl flex-col gap-4 p-4 lg:p-6">
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_340px] min-h-0">
        <ChatPane
          messages={messages as UIMessage[]}
          status={status as "ready" | "submitted" | "streaming" | "error"}
          isStreaming={isStreaming}
          onSend={handleSend}
          onClear={handleClear}
          ttsEnabled={ttsEnabled}
          onToggleTts={() => setTtsEnabled((v) => !v)}
          onOpenSettings={() => setSettingsOpen(true)}
          provider={agentState.provider}
        />
        <aside className="flex flex-col gap-4 overflow-y-auto">
          <WorkflowTimeline steps={agentState.steps} activeWorkflowId={agentState.activeWorkflowId} />
          {agentState.lastBriefing ? (
            <SourceCards
              briefing={agentState.lastBriefing}
              permalinkId={agentState.lastPermalinkId}
            />
          ) : null}
          <MemoryPanel memories={agentState.recalledMemories} />
          <footer className="text-[10px] text-zinc-600 leading-relaxed">
            <p>
              session <code>{sessionId}</code>
            </p>
            <p>
              <span title="active llm provider">{agentState.provider}</span> · workflows ·
              vectorize · durable objects · pages
            </p>
            <p className="mt-1">
              <a
                href="/api/mcp"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-clarity-accent-soft"
                title="MCP-style JSON-RPC endpoint"
              >
                /api/mcp
              </a>{" "}
              ·{" "}
              <a
                href="/api/health"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-clarity-accent-soft"
              >
                /api/health
              </a>
            </p>
          </footer>
        </aside>
      </div>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sessionId={sessionId}
        provider={agentState.provider}
      />
      <ErrorToast message={error} onDismiss={() => setError(null)} />
    </div>
  );
}
