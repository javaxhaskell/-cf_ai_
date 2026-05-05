import { useEffect, useRef, useState, type FormEvent } from "react";
import type { UIMessage } from "ai";
import { VoiceInput } from "./VoiceInput.js";

type Status = "ready" | "submitted" | "streaming" | "error";

type Props = {
  messages: UIMessage[];
  status: Status;
  isStreaming: boolean;
  onSend: (text: string) => void;
  onClear: () => void;
  ttsEnabled: boolean;
  onToggleTts: () => void;
};

function renderMessageText(msg: UIMessage): string {
  return (msg.parts ?? [])
    .filter((p): p is Extract<UIMessage["parts"][number], { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdown(text: string): string {
  const escaped = escapeHtml(text);
  let out = escaped;
  out = out.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  out = out.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(
    /\bhttps?:\/\/[^\s<]+/g,
    (m) => `<a href="${m}" target="_blank" rel="noopener noreferrer" class="text-clarity-accent-soft underline">${m}</a>`,
  );
  out = out.replace(/^- (.*)$/gm, "<li>$1</li>");
  out = out.replace(/(<li>.*<\/li>)(?:\n(?=<li>))?/gs, (block) =>
    block.includes("<li>") ? `<ul>${block}</ul>` : block,
  );
  out = out.replace(/\n{2,}/g, "</p><p>");
  out = out.replace(/\n/g, "<br/>");
  return `<p>${out}</p>`;
}

export function ChatPane({
  messages,
  status,
  isStreaming,
  onSend,
  onClear,
  ttsEnabled,
  onToggleTts,
}: Props) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
  }

  return (
    <section className="flex h-full flex-col rounded-lg border border-zinc-800 bg-zinc-950/40">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-clarity-accent shadow-[0_0_10px] shadow-clarity-accent" />
          <h1 className="text-sm font-semibold tracking-wide">Clarity</h1>
          <span className="text-[10px] text-zinc-500">research agent · cloudflare</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleTts}
            aria-pressed={ttsEnabled}
            className={`text-xs rounded-md border px-2 py-1 ${
              ttsEnabled
                ? "border-clarity-accent/60 text-clarity-accent-soft bg-clarity-accent/10"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            🔊 TTS {ttsEnabled ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="text-xs rounded-md border border-zinc-700 px-2 py-1 text-zinc-400 hover:text-zinc-200"
          >
            clear
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <Welcome />
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))
        )}
        {(status === "submitted" || status === "streaming") && messages.at(-1)?.role !== "assistant" ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="inline-block h-2 w-12 rounded-full shimmer" />
            <span>thinking…</span>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={submit}
        className="flex flex-col gap-2 border-t border-zinc-800 px-4 py-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything — e.g. Compare Postgres vs SQLite for an edge-deployed app"
            rows={2}
            className="flex-1 resize-none rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-clarity-accent focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="rounded-md bg-clarity-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-40 disabled:cursor-not-allowed hover:bg-clarity-accent-soft transition"
          >
            send
          </button>
        </div>
        <div className="flex items-center justify-between">
          <VoiceInput onTranscript={(t) => onSend(t)} disabled={isStreaming} />
          <span className="text-[10px] text-zinc-600">
            ⏎ to send · ⇧⏎ for newline · llama 3.3 on workers ai
          </span>
        </div>
      </form>
    </section>
  );
}

function Welcome() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-sm text-zinc-400">
      <p className="font-medium text-zinc-200">Ask Clarity to research something.</p>
      <p className="mt-2">
        It will plan, search the web, fetch sources, summarize, critique, and synthesize a cited
        briefing — all durably orchestrated by a Cloudflare Workflow.
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        Try: <em>“Compare Postgres vs SQLite for an edge-deployed app”</em>
      </p>
    </div>
  );
}

function MessageBubble({ msg }: { msg: UIMessage }) {
  const text = renderMessageText(msg);
  const isUser = msg.role === "user";
  return (
    <article
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      aria-label={isUser ? "Your message" : "Clarity reply"}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-clarity-accent text-black rounded-br-sm"
            : "bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-bl-sm"
        }`}
      >
        <div
          className="prose-clarity"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
        />
      </div>
    </article>
  );
}
