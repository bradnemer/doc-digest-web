"use client";

import { useEffect, useRef } from "react";

interface Props {
  x: number;
  y: number;
  selectionText: string;
  sectionId: string | null;
  documentId: string;
  onAction: (action: "ask" | "factcheck" | "summarize") => void;
  onOpenChat: () => void;
  onMessage: (msg: string) => void;
}

const ACTIONS = [
  { key: "ask" as const, label: "Ask" },
  { key: "factcheck" as const, label: "Fact-check" },
  { key: "summarize" as const, label: "Summarize" },
];

export default function SelectionPopup({
  x,
  y,
  onAction,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Clamp to viewport
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Position above the cursor, clamped to viewport edges
    el.style.left = Math.min(x, window.innerWidth - rect.width - 8) + "px";
    el.style.top = Math.max(8, y - rect.height - 12) + "px";
  });

  return (
    <div
      id="selection-popup"
      ref={ref}
      className="fixed z-50 flex items-center gap-1 rounded-lg shadow-lg border px-2 py-1.5"
      style={{
        background: "var(--bg-primary, white)",
        borderColor: "var(--border)",
        top: y - 52,
        left: x,
      }}
    >
      {ACTIONS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onAction(key)}
          className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:text-white"
          style={{
            color: "var(--accent)",
            background: "transparent",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--accent)"; (e.currentTarget as HTMLButtonElement).style.color = "white"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--accent)"; }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
