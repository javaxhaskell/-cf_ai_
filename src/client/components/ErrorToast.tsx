import { useEffect, useState } from "react";

type Props = {
  message: string | null;
  onDismiss: () => void;
};

export function ErrorToast({ message, onDismiss }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 220);
    }, 6000);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`fixed bottom-6 right-6 max-w-sm rounded-md border border-red-500/60 bg-red-500/15 px-4 py-3 text-sm text-red-100 shadow-lg backdrop-blur transition-all ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden>⚠</span>
        <div className="flex-1">
          <strong className="block text-red-50 mb-0.5">Workflow error</strong>
          <span className="text-red-100/90">{message}</span>
        </div>
        <button
          type="button"
          className="text-red-200 hover:text-red-50"
          onClick={() => {
            setVisible(false);
            setTimeout(onDismiss, 220);
          }}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
