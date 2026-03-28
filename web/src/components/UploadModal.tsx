"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Document } from "@/types/database";

const ACCEPTED = ["application/pdf", "text/markdown", "text/x-markdown"];
const ACCEPTED_EXT = [".pdf", ".md", ".markdown"];
const MAX_BYTES = 25 * 1024 * 1024;

type Stage = "idle" | "uploading" | "processing" | "error";

export default function UploadModal({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: (doc: Document) => void;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const router = useRouter();

  const handleFile = useCallback(async (file: File) => {
    setError("");

    // Client-side validation
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["pdf", "md", "markdown"].includes(ext)) {
      setError("Only PDF and Markdown files are supported.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("File exceeds the 25 MB limit.");
      return;
    }

    setStage("uploading");

    // Get signed upload URL
    const urlRes = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, size: file.size }),
    });
    const urlData = await urlRes.json();
    if (!urlRes.ok) {
      setError(urlData.error ?? "Failed to get upload URL");
      setStage("error");
      return;
    }

    // Upload directly to Supabase Storage
    const uploadRes = await fetch(urlData.signed_url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });

    if (!uploadRes.ok) {
      setError("Upload failed. Please try again.");
      setStage("error");
      return;
    }

    setProgress(100);

    // Create document record and trigger extraction
    const sourceType = ext === "pdf" ? "pdf" : "markdown";
    const docRes = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        storage_path: urlData.storage_path,
        source_type: sourceType,
      }),
    });
    const docData = await docRes.json();
    if (!docRes.ok) {
      setError(docData.error ?? "Failed to create document");
      setStage("error");
      return;
    }

    setStage("processing");

    // Poll for completion
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const res = await fetch(`/api/documents/${docData.id}/status`);
      const status = await res.json();

      if (status.status === "ready") {
        const docRes = await fetch(`/api/documents`);
        const docs = await docRes.json();
        const doc = docs.find((d: Document) => d.id === docData.id);
        if (doc) {
          onComplete(doc);
          router.push(`/documents/${doc.id}`);
        }
        return;
      }

      if (status.status === "failed") {
        setError(status.error_message ?? "Processing failed");
        setStage("error");
        return;
      }
    }
  }, [router, onComplete]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  async function handleRetry() {
    setStage("idle");
    setError("");
    setProgress(0);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-xl leading-none"
          style={{ color: "var(--text-secondary)" }}
        >
          ×
        </button>

        <h2 className="text-xl font-bold mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>
          Upload document
        </h2>

        {stage === "idle" && (
          <label
            onDragEnter={() => setDragging(true)}
            onDragLeave={() => setDragging(false)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-14 px-6 cursor-pointer transition-colors"
            style={{
              borderColor: dragging ? "var(--accent)" : "var(--border)",
              background: dragging ? "var(--accent-light)" : "var(--bg-secondary)",
            }}
          >
            <span className="text-4xl mb-3">📄</span>
            <p className="text-sm font-medium mb-1">Drag & drop your file here</p>
            <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
              PDF or Markdown · Max 25 MB
            </p>
            <span
              className="text-xs px-4 py-1.5 rounded-full text-white"
              style={{ background: "var(--accent)" }}
            >
              Browse files
            </span>
            <input
              type="file"
              accept={[...ACCEPTED, ...ACCEPTED_EXT].join(",")}
              className="hidden"
              onChange={handleInputChange}
            />
          </label>
        )}

        {stage === "uploading" && (
          <div className="text-center py-10">
            <div className="w-full h-2 rounded-full mb-4" style={{ background: "var(--bg-secondary)" }}>
              <div
                className="h-2 rounded-full transition-all"
                style={{ width: `${progress}%`, background: "var(--accent)" }}
              />
            </div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Uploading…</p>
          </div>
        )}

        {stage === "processing" && (
          <div className="text-center py-10">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-4" style={{ borderColor: "var(--accent)" }} />
            <p className="text-sm font-medium mb-1">Extracting document…</p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              This may take up to a minute for large PDFs.
            </p>
          </div>
        )}

        {stage === "error" && (
          <div className="text-center py-8">
            <p className="text-sm mb-4 px-4 py-3 rounded-lg" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
              {error}
            </p>
            <button
              onClick={handleRetry}
              className="px-6 py-2 rounded-lg text-white text-sm font-medium"
              style={{ background: "var(--accent)" }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
