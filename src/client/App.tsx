import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import { ChatPane } from "./components/ChatPane.js";
import { WorkflowTimeline } from "./components/WorkflowTimeline.js";
import { MemoryPanel } from "./components/MemoryPanel.js";
import type { ClientAgentState } from "./types.js";
import { speak } from "./hooks/useVoice.js";

const DEFAULT_STATE: ClientAgentState = {
  activeWorkflowId: null,
  steps: [],
  recalledMemoryIds: [],
  recalledMemories: [],
  lastBriefing: null,
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
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_320px] min-h-0">
        <ChatPane
          messages={messages as UIMessage[]}
          status={status as "ready" | "submitted" | "streaming" | "error"}
          isStreaming={isStreaming}
          onSend={handleSend}
          onClear={handleClear}
          ttsEnabled={ttsEnabled}
          onToggleTts={() => setTtsEnabled((v) => !v)}
        />
        <aside className="flex flex-col gap-4 overflow-y-auto">
          <WorkflowTimeline steps={agentState.steps} activeWorkflowId={agentState.activeWorkflowId} />
          <MemoryPanel memories={agentState.recalledMemories} />
          <footer className="text-[10px] text-zinc-600 leading-relaxed">
            <p>
              session <code>{sessionId}</code>
            </p>
            <p>
              llama 3.3 · workflows · vectorize · durable objects · pages
            </p>
          </footer>
        </aside>
      </div>
    </div>
  );
}
