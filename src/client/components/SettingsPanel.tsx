import { useEffect, useState } from "react";

export type Settings = {
  ttsEnabled: boolean;
  recallThreshold: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  provider: "workers-ai" | "openai" | "anthropic";
};

export function SettingsPanel({ open, onClose, sessionId, provider }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/prefs?session=${encodeURIComponent(sessionId)}`);
        if (!res.ok) return;
        const data = (await res.json()) as Settings;
        if (!cancelled) setSettings(data);
      } catch {
        if (!cancelled) setSettings({ ttsEnabled: false, recallThreshold: 0.72 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sessionId]);

  async function update(patch: Partial<Settings>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/prefs?session=${encodeURIComponent(sessionId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = (await res.json()) as Settings;
        setSettings(data);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-950 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-zinc-400 hover:text-zinc-100"
            aria-label="Close settings"
          >
            ✕
          </button>
        </header>

        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-zinc-300 font-medium">Active LLM provider</dt>
            <dd className="mt-1 text-xs text-zinc-400">
              <code className="text-clarity-accent-soft">{provider}</code> · set
              {" "}
              <code>OPENAI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code> as a wrangler secret
              to switch.
            </dd>
          </div>

          <div>
            <dt className="text-zinc-300 font-medium flex justify-between">
              <span>TTS playback</span>
              <span className="text-[10px] text-zinc-500">{settings?.ttsEnabled ? "on" : "off"}</span>
            </dt>
            <dd className="mt-1">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={settings?.ttsEnabled ?? false}
                  onChange={(e) => void update({ ttsEnabled: e.target.checked })}
                  disabled={saving || !settings}
                  className="accent-clarity-accent"
                />
                Speak assistant replies aloud
              </label>
            </dd>
          </div>

          <div>
            <dt className="text-zinc-300 font-medium flex justify-between">
              <span>Memory recall threshold</span>
              <span className="text-[10px] text-zinc-500 tabular-nums">
                {(settings?.recallThreshold ?? 0.72).toFixed(2)}
              </span>
            </dt>
            <dd className="mt-1">
              <input
                type="range"
                min={0.4}
                max={0.95}
                step={0.01}
                value={settings?.recallThreshold ?? 0.72}
                onChange={(e) => void update({ recallThreshold: Number(e.target.value) })}
                disabled={saving || !settings}
                className="w-full accent-clarity-accent"
              />
              <p className="mt-1 text-[10px] text-zinc-500">
                Higher = stricter; recall fewer prior briefings.
              </p>
            </dd>
          </div>

          <div>
            <dt className="text-zinc-300 font-medium">Session</dt>
            <dd className="mt-1 text-xs text-zinc-400">
              <code>{sessionId}</code> · stored in <code>localStorage</code>.
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
