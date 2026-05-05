import { useVoice } from "../hooks/useVoice.js";

type Props = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
};

export function VoiceInput({ onTranscript, disabled }: Props) {
  const { supported, listening, interim, start, stop, error } = useVoice(onTranscript);

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        title="Web Speech API not supported in this browser"
        className="px-3 py-2 rounded-md border border-zinc-700 bg-zinc-900 text-zinc-500 text-sm cursor-not-allowed"
      >
        🎤 unsupported
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={listening ? stop : start}
        disabled={disabled}
        aria-pressed={listening}
        className={`px-3 py-2 rounded-md text-sm font-medium border transition ${
          listening
            ? "bg-red-500/20 border-red-500 text-red-200 animate-pulse"
            : "bg-zinc-900 border-zinc-700 text-zinc-200 hover:border-zinc-500"
        } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
      >
        {listening ? "● listening" : "🎤 speak"}
      </button>
      {interim ? (
        <span className="text-xs text-zinc-400 italic max-w-xs truncate">{interim}…</span>
      ) : null}
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}
