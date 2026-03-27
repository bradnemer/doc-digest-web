"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Document } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import UploadModal from "./UploadModal";

const MAX_DOCS = 20;

function statusBadge(status: Document["status"]) {
  if (status === "ready") return null;
  if (status === "processing") return (
    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
      Processing…
    </span>
  );
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Failed</span>
  );
}

export default function Dashboard({
  initialDocuments,
  userEmail,
}: {
  initialDocuments: Document[];
  userEmail: string;
}) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments);
  const [showUpload, setShowUpload] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();

  const atLimit = documents.filter(d => d.status !== "failed").length >= MAX_DOCS;

  // Poll for processing documents
  const pollProcessing = useCallback(async () => {
    const processing = documents.filter(d => d.status === "processing");
    if (!processing.length) return;

    const updates = await Promise.all(
      processing.map(async (doc) => {
        const res = await fetch(`/api/documents/${doc.id}/status`);
        if (!res.ok) return null;
        return { id: doc.id, ...(await res.json()) };
      })
    );

    setDocuments(prev =>
      prev.map(doc => {
        const update = updates.find(u => u?.id === doc.id);
        if (!update) return doc;
        return { ...doc, status: update.status, error_message: update.error_message };
      })
    );
  }, [documents]);

  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === "processing");
    if (!hasProcessing) return;
    const timer = setInterval(pollProcessing, 5000);
    return () => clearInterval(timer);
  }, [documents, pollProcessing]);

  async function handleDelete(doc: Document) {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    setDeletingId(doc.id);
    await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    setDocuments(prev => prev.filter(d => d.id !== doc.id));
    setDeletingId(null);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  function onUploadComplete(doc: Document) {
    setDocuments(prev => [doc, ...prev]);
    setShowUpload(false);
  }

  return (
    <>
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: "var(--border)", background: "white" }}>
        <h1 className="text-xl font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>
          Doc Digest
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{userEmail}</span>
          <button
            onClick={handleSignOut}
            className="text-sm underline"
            style={{ color: "var(--text-secondary)" }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto w-full px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>
            Your Documents
          </h2>
          <button
            onClick={() => setShowUpload(true)}
            disabled={atLimit}
            title={atLimit ? "You've reached the 20-document limit. Delete a document to upload a new one." : undefined}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-opacity disabled:opacity-40"
            style={{ background: "var(--accent)" }}
          >
            + Upload document
          </button>
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-lg mb-2" style={{ color: "var(--text-secondary)" }}>No documents yet</p>
            <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>Upload a PDF or Markdown file to get started.</p>
            <button
              onClick={() => setShowUpload(true)}
              className="px-6 py-2 rounded-lg text-white text-sm font-medium"
              style={{ background: "var(--accent)" }}
            >
              Upload your first document
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {documents.map(doc => (
              <div
                key={doc.id}
                className="rounded-xl border p-5 flex flex-col gap-3"
                style={{ borderColor: "var(--border)", background: "white" }}
              >
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate leading-snug" style={{ fontFamily: "'Playfair Display', serif" }}>
                      {doc.title}
                    </p>
                    <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
                      {doc.source_filename}
                    </p>
                  </div>
                  {statusBadge(doc.status)}
                </div>

                {/* Meta */}
                {doc.status === "ready" && (
                  <div className="flex gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                    {doc.page_count != null && <span>{doc.page_count} pages</span>}
                    {doc.section_count != null && <span>{doc.section_count} sections</span>}
                    <span className={`px-1.5 py-0.5 rounded text-xs ${doc.is_public ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                      {doc.is_public ? "Public" : "Private"}
                    </span>
                  </div>
                )}

                {/* Error */}
                {doc.status === "failed" && (
                  <p className="text-xs" style={{ color: "var(--accent)" }}>
                    {doc.error_message ?? "Processing failed"}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto pt-1">
                  {doc.status === "ready" && (
                    <Link
                      href={`/documents/${doc.id}`}
                      className="flex-1 text-center py-1.5 rounded-lg text-sm font-medium text-white"
                      style={{ background: "var(--accent)" }}
                    >
                      Open
                    </Link>
                  )}
                  {doc.status === "processing" && (
                    <div className="flex-1 text-center py-1.5 rounded-lg text-sm" style={{ color: "var(--text-secondary)", background: "var(--bg-secondary)" }}>
                      Processing…
                    </div>
                  )}
                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={deletingId === doc.id}
                    className="px-3 py-1.5 rounded-lg text-sm border transition-colors hover:bg-red-50 hover:border-red-200 hover:text-red-700 disabled:opacity-50"
                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    {deletingId === doc.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onComplete={onUploadComplete}
        />
      )}
    </>
  );
}
