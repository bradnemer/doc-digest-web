"use client";

import { useState, useEffect } from "react";
import type { DocumentVersion, Section } from "@/types/database";

interface Props {
  documentId: string;
  onClose: () => void;
  onRestore: (sections: Section[], newVersionNumber: number) => void;
  isAuthenticated: boolean;
}

export default function VersionHistory({ documentId, onClose, onRestore, isAuthenticated }: Props) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ versionNumber: number; sections: Section[] } | null>(null);

  useEffect(() => {
    fetch(`/api/documents/${documentId}/versions`)
      .then(r => r.json())
      .then(data => { setVersions(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [documentId]);

  async function loadPreview(versionNumber: number) {
    if (preview?.versionNumber === versionNumber) {
      setPreview(null);
      return;
    }
    const res = await fetch(`/api/documents/${documentId}/versions/${versionNumber}`);
    if (res.ok) {
      const data = await res.json();
      setPreview({ versionNumber, sections: data.sections });
    }
  }

  async function handleRestore(versionNumber: number) {
    if (!confirm(`Restore to version ${versionNumber}? This creates a new version.`)) return;
    setRestoring(versionNumber);
    try {
      const res = await fetch(`/api/documents/${documentId}/versions/${versionNumber}/restore`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        onRestore(data.sections, data.version_number);
      }
    } finally {
      setRestoring(null);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <aside
        className="fixed right-0 top-0 h-full z-50 flex flex-col shadow-2xl"
        style={{ width: 360, background: "white", borderLeft: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="font-bold text-base" style={{ fontFamily: "'Playfair Display', serif" }}>
            Version history
          </h2>
          <button onClick={onClose} className="text-xl leading-none" style={{ color: "var(--text-secondary)" }}>×</button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <p className="text-sm text-center py-10" style={{ color: "var(--text-secondary)" }}>Loading…</p>
          )}

          {!loading && versions.length === 0 && (
            <p className="text-sm text-center py-10" style={{ color: "var(--text-secondary)" }}>No versions yet.</p>
          )}

          {versions.map(v => (
            <div key={v.id} className="mb-3">
              <div
                className="rounded-xl border p-4"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">Version {v.version_number}</span>
                  {v.restore_of != null && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                      Restored
                    </span>
                  )}
                </div>
                <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
                  {new Date(v.created_at).toLocaleString()}
                  {v.edited_section && (
                    <span className="ml-2 italic">edited section</span>
                  )}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadPreview(v.version_number)}
                    className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    {preview?.versionNumber === v.version_number ? "Hide preview" : "Preview"}
                  </button>
                  {isAuthenticated && (
                    <button
                      onClick={() => handleRestore(v.version_number)}
                      disabled={restoring === v.version_number}
                      className="text-xs px-3 py-1.5 rounded-lg text-white transition-opacity disabled:opacity-50"
                      style={{ background: "var(--accent)" }}
                    >
                      {restoring === v.version_number ? "Restoring…" : "Restore"}
                    </button>
                  )}
                </div>
              </div>

              {/* Preview */}
              {preview?.versionNumber === v.version_number && (
                <div
                  className="mt-2 rounded-xl border p-4 text-xs overflow-y-auto"
                  style={{ borderColor: "var(--border)", maxHeight: 300, color: "var(--text-secondary)" }}
                >
                  {preview.sections.map(s => (
                    <div key={s.id} className="mb-3">
                      <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{s.title}</p>
                      <p className="line-clamp-3">{s.content.slice(0, 200)}{s.content.length > 200 ? "…" : ""}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
