"use client";

import { useState, useRef, useEffect } from "react";
import type { Section } from "@/types/database";

interface Props {
  section: Section;
  onSave: (content: string) => Promise<void>;
  onCancel: () => void;
}

export default function SectionEditor({ section, onSave, onCancel }: Props) {
  const [content, setContent] = useState(section.content);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    autoResize();
  }, []);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(content);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onCancel();
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
  }

  return (
    <div>
      {section.level === 2 ? (
        <h2
          className="text-2xl font-bold mb-4"
          style={{
            fontFamily: "'Playfair Display', serif",
            color: "var(--accent)",
            borderBottom: "2px solid var(--accent)",
            paddingBottom: 8,
          }}
        >
          {section.title}
        </h2>
      ) : (
        <h3
          className="text-lg font-semibold mb-3"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          {section.title}
        </h3>
      )}

      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => { setContent(e.target.value); autoResize(); }}
        onKeyDown={handleKeyDown}
        rows={6}
        className="w-full rounded-lg border px-4 py-3 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:ring-2"
        style={{
          borderColor: "var(--accent)",
          color: "var(--text-primary)",
          background: "var(--bg-secondary)",
          minHeight: 160,
        }}
      />

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleSave}
          disabled={saving || content === section.content}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-opacity"
          style={{ background: "var(--accent)" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-1.5 rounded-lg text-sm border transition-colors hover:bg-gray-50"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          Cancel
        </button>
        <span className="text-xs ml-auto" style={{ color: "var(--text-secondary)" }}>
          ⌘↵ to save · Esc to cancel
        </span>
      </div>
    </div>
  );
}
