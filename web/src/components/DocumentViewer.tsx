"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { Document, Section, ChatMessage } from "@/types/database";
import ChatPanel from "./ChatPanel";
import SectionEditor from "./SectionEditor";
import VersionHistory from "./VersionHistory";
import ShareModal from "./ShareModal";
import SelectionPopup from "./SelectionPopup";
import { renderMarkdown } from "@/lib/markdown";

interface Props {
  document: Document;
  sections: Section[];
  currentVersionNumber: number;
  initialChatMessages: ChatMessage[];
  isOwner: boolean;
  isAuthenticated: boolean;
  isSharedView?: boolean;
}

export default function DocumentViewer({
  document: doc,
  sections: initialSections,
  currentVersionNumber,
  initialChatMessages,
  isOwner,
  isAuthenticated,
  isSharedView = false,
}: Props) {
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [versionNumber, setVersionNumber] = useState(currentVersionNumber);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(initialChatMessages);
  const [selectionState, setSelectionState] = useState<{
    text: string; sectionId: string | null; x: number; y: number; action?: "ask" | "factcheck" | "summarize"
  } | null>(null);

  const mainRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver for active ToC tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-10% 0px -80% 0px" }
    );
    document.querySelectorAll(".doc-section").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  // Text selection popup
  useEffect(() => {
    function handleMouseUp(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("#chat-panel") || target.closest("#selection-popup")) return;

      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim() ?? "";
        if (text.length >= 10) {
          const sectionEl = (e.target as HTMLElement).closest("[data-section-id]");
          setSelectionState({
            text,
            sectionId: (sectionEl as HTMLElement)?.dataset.sectionId ?? null,
            x: e.clientX,
            y: e.clientY,
          });
        } else {
          setSelectionState(null);
        }
      }, 150);
    }

    function handleMouseDown(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest("#selection-popup")) {
        setSelectionState(null);
      }
    }

    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousedown", handleMouseDown);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousedown", handleMouseDown);
    };
  }, []);

  const handleSectionSave = useCallback(async (sectionId: string, newContent: string) => {
    const updated = sections.map(s =>
      s.id === sectionId
        ? { ...s, content: newContent, word_count: newContent.split(/\s+/).length }
        : s
    );

    const res = await fetch(`/api/documents/${doc.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections: updated, edited_section: sectionId }),
    });

    if (res.ok) {
      const version = await res.json();
      setSections(updated);
      setVersionNumber(version.version_number);
    }
    setEditingId(null);
  }, [sections, doc.id]);

  const handleRestore = useCallback((restoredSections: Section[], newVersionNumber: number) => {
    setSections(restoredSections);
    setVersionNumber(newVersionNumber);
    setShowVersions(false);
  }, []);

  function handlePrint() {
    window.print();
  }

  const handleSelectionAction = useCallback((action: "ask" | "factcheck" | "summarize") => {
    if (!selectionState) return;
    setSelectionState(prev => prev ? { ...prev, action } : null);
    setChatOpen(true);
  }, [selectionState]);

  return (
    <>
      {/* Magazine Feature fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Source+Sans+3:wght@300;400;600&display=swap"
        rel="stylesheet"
      />

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .content-area { max-width: 100% !important; }
          @page { margin: 1in; }
          h2, h3 { break-after: avoid; }
          footer.print-footer { display: block !important; }
          .doc-section { break-inside: avoid-page; }
        }
        .doc-section {
          opacity: 0;
          transform: translateY(16px);
          transition: opacity 0.4s ease, transform 0.4s ease;
        }
        .doc-section.visible {
          opacity: 1;
          transform: translateY(0);
        }
        @media (prefers-reduced-motion: reduce) {
          .doc-section { opacity: 1; transform: none; transition: none; }
        }
      `}</style>

      <div className="flex min-h-screen" style={{ fontFamily: "'Source Sans 3', sans-serif", background: "var(--bg-primary)" }}>
        {/* ToC Sidebar */}
        <nav
          className="no-print sticky top-0 h-screen overflow-y-auto shrink-0 border-r hidden md:flex flex-col"
          style={{ width: 240, borderColor: "var(--border)", background: "var(--bg-secondary)", padding: "24px 16px" }}
        >
          <Link href="/" className="text-xs font-semibold mb-6 block" style={{ color: "var(--text-secondary)", letterSpacing: "0.1em" }}>
            ← Dashboard
          </Link>
          <p className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
            Contents
          </p>
          {sections.map(s => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="block py-1.5 px-2 rounded-md text-sm transition-colors"
              style={{
                paddingLeft: s.level === 3 ? 20 : 8,
                color: activeSection === s.id ? "var(--accent)" : "var(--text-secondary)",
                background: activeSection === s.id ? "var(--accent-light)" : "transparent",
                fontWeight: activeSection === s.id ? 600 : 400,
              }}
            >
              {s.title}
            </a>
          ))}
        </nav>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <header
            className="no-print sticky top-0 z-20 border-b flex items-center gap-3 px-6 py-3"
            style={{ borderColor: "var(--border)", background: "white" }}
          >
            <Link href="/" className="text-sm md:hidden" style={{ color: "var(--text-secondary)" }}>←</Link>
            <h1
              className="flex-1 font-bold text-base truncate"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {doc.title}
            </h1>
            <span className="text-xs hidden sm:block" style={{ color: "var(--text-secondary)" }}>
              v{versionNumber}
            </span>
            {isOwner && (
              <button
                onClick={() => setShowVersions(true)}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
              >
                History
              </button>
            )}
            {isOwner && (
              <button
                onClick={() => setShowShare(true)}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
              >
                Share
              </button>
            )}
            <button
              onClick={handlePrint}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-gray-50"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              Export PDF
            </button>
            <button
              onClick={() => setChatOpen(o => !o)}
              className="no-print text-xs px-3 py-1.5 rounded-lg border transition-colors"
              style={chatOpen
                ? { borderColor: "var(--accent)", background: "var(--accent-light)", color: "var(--accent)" }
                : { borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              Chat
            </button>
          </header>

          {/* Doc header */}
          <div
            className="content-area border-b px-8 py-10"
            style={{ maxWidth: 760, margin: "0 auto", width: "100%", borderColor: "var(--border)" }}
          >
            <h1
              className="text-3xl md:text-4xl font-bold leading-tight mb-3"
              style={{ fontFamily: "'Playfair Display', serif", color: "var(--text-primary)" }}
            >
              {doc.title}
            </h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {doc.source_filename}
              {doc.page_count != null && ` · ${doc.page_count} pages`}
              {doc.section_count != null && ` · ${doc.section_count} sections`}
            </p>
          </div>

          {/* Sections */}
          <div ref={mainRef} className="flex-1 px-8 py-8 content-area" style={{ maxWidth: 760, margin: "0 auto", width: "100%" }}>
            {sections.map(s => (
              <div
                key={s.id}
                id={s.id}
                data-section-id={s.id}
                className="doc-section mb-10 group"
              >
                {editingId === s.id ? (
                  <SectionEditor
                    section={s}
                    onSave={(content) => handleSectionSave(s.id, content)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      {s.level === 2 ? (
                        <h2
                          className="flex-1 text-2xl font-bold mb-4"
                          style={{ fontFamily: "'Playfair Display', serif", color: "var(--accent)", borderBottom: "2px solid var(--accent)", paddingBottom: 8 }}
                        >
                          {s.title}
                        </h2>
                      ) : (
                        <h3
                          className="flex-1 text-lg font-semibold mb-3"
                          style={{ fontFamily: "'Playfair Display', serif" }}
                        >
                          {s.title}
                        </h3>
                      )}
                      {isAuthenticated && (
                        <button
                          onClick={() => {
                            if (editingId && editingId !== s.id) {
                              if (!confirm("Discard unsaved changes?")) return;
                            }
                            setEditingId(s.id);
                          }}
                          className="no-print opacity-0 group-hover:opacity-100 transition-opacity mt-1 text-xs px-2 py-1 rounded border"
                          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                        >
                          ✏️ Edit
                        </button>
                      )}
                    </div>
                    <div
                      className="prose-sm leading-relaxed"
                      style={{ color: "var(--text-primary)", lineHeight: 1.75 }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(s.content) }}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chat Panel */}
      <ChatPanel
        documentId={doc.id}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        initialMessages={chatMessages}
        onMessagesUpdate={setChatMessages}
        pendingAction={selectionState?.action ? { text: selectionState.text, sectionId: selectionState.sectionId, action: selectionState.action } : null}
        onPendingActionConsumed={() => setSelectionState(null)}
      />

      {/* Selection Popup */}
      {selectionState && (
        <SelectionPopup
          x={selectionState.x}
          y={selectionState.y}
          onAction={(action) => {
            // Pass action to chat panel
            handleSelectionAction(action);
          }}
          selectionText={selectionState.text}
          sectionId={selectionState.sectionId}
          documentId={doc.id}
          onOpenChat={() => setChatOpen(true)}
          onMessage={(msg) => {
            setChatOpen(true);
          }}
        />
      )}

      {/* Version History Drawer */}
      {showVersions && (
        <VersionHistory
          documentId={doc.id}
          onClose={() => setShowVersions(false)}
          onRestore={handleRestore}
          isAuthenticated={isAuthenticated}
        />
      )}

      {/* Share Modal */}
      {showShare && isOwner && (
        <ShareModal
          document={doc}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* Section reveal script */}
      <SectionRevealObserver />
    </>
  );
}

function SectionRevealObserver() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add("visible");
      }),
      { threshold: 0.1 }
    );
    document.querySelectorAll(".doc-section").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return null;
}
