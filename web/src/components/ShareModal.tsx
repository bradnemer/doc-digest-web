"use client";

import { useState } from "react";
import type { Document } from "@/types/database";

interface Props {
  document: Document;
  onClose: () => void;
}

export default function ShareModal({ document: doc, onClose }: Props) {
  const [isPublic, setIsPublic] = useState(doc.is_public ?? false);
  const [shareToken, setShareToken] = useState(doc.share_token ?? "");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = shareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/shared/${shareToken}`
    : "";

  async function togglePublic() {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/share`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setIsPublic(data.is_public);
        setShareToken(data.share_token ?? "");
      }
    } finally {
      setLoading(false);
    }
  }

  async function resetLink() {
    if (!confirm("Regenerate share link? The old link will stop working.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/share/reset`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setShareToken(data.share_token);
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-xl leading-none"
          style={{ color: "var(--text-secondary)" }}
        >
          ×
        </button>

        <h2 className="text-xl font-bold mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
          Share document
        </h2>

        {/* Public toggle */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="font-medium text-sm">Public access</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Anyone with the link can view this document
            </p>
          </div>
          <button
            onClick={togglePublic}
            disabled={loading}
            className="relative w-11 h-6 rounded-full transition-colors disabled:opacity-50"
            style={{ background: isPublic ? "var(--accent)" : "var(--border)" }}
            role="switch"
            aria-checked={isPublic}
          >
            <span
              className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
              style={{ transform: isPublic ? "translateX(20px)" : "translateX(0)" }}
            />
          </button>
        </div>

        {/* Share link */}
        {isPublic && shareToken && (
          <div>
            <p className="text-xs font-semibold mb-2 uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
              Share link
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 text-xs px-3 py-2 rounded-lg border truncate focus:outline-none"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
                onFocus={e => e.target.select()}
              />
              <button
                onClick={copyLink}
                className="px-3 py-2 rounded-lg text-xs font-medium text-white transition-opacity"
                style={{ background: "var(--accent)" }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <button
              onClick={resetLink}
              disabled={loading}
              className="mt-3 text-xs underline"
              style={{ color: "var(--text-secondary)" }}
            >
              Reset link
            </button>
          </div>
        )}

        {!isPublic && (
          <p className="text-sm text-center py-4" style={{ color: "var(--text-secondary)" }}>
            Enable public access to generate a share link.
          </p>
        )}
      </div>
    </div>
  );
}
