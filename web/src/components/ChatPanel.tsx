"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ChatMessage } from "@/types/database";
import { renderMarkdown } from "@/lib/markdown";

interface Props {
  documentId: string;
  open: boolean;
  onClose: () => void;
  initialMessages: ChatMessage[];
  onMessagesUpdate: (messages: ChatMessage[]) => void;
  pendingAction: { text: string; sectionId: string | null; action?: "ask" | "factcheck" | "summarize" } | null;
  onPendingActionConsumed: () => void;
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

function buildPrompt(action: "ask" | "factcheck" | "summarize", text: string): string {
  if (action === "factcheck") return `Please fact-check the following passage:\n\n"${text}"`;
  if (action === "summarize") return `Please summarize the following passage:\n\n"${text}"`;
  return `Regarding this passage: "${text}"\n\nWhat can you tell me about it?`;
}

export default function ChatPanel({
  documentId,
  open,
  onClose,
  initialMessages,
  onMessagesUpdate,
  pendingAction,
  onPendingActionConsumed,
}: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>(() =>
    initialMessages.map(m => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content }))
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [followups, setFollowups] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync initial messages when they change externally
  useEffect(() => {
    setMessages(initialMessages.map(m => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
    })));
  }, [initialMessages]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Handle pending selection action
  useEffect(() => {
    if (!pendingAction || !open) return;
    const prompt = buildPrompt(pendingAction.action ?? "ask", pendingAction.text);
    onPendingActionConsumed();
    sendMessage(prompt, pendingAction.sectionId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction, open]);

  const sendMessage = useCallback(async (text: string, sectionId?: string | null) => {
    if (!text.trim() || streaming) return;

    setFollowups([]);

    const userMsg: DisplayMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
    };
    const assistantMsg: DisplayMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      streaming: true,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: documentId,
          message: text.trim(),
          section_id: sectionId ?? null,
          conversation_history: messages
            .filter(m => !m.streaming)
            .map(m => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error("Stream failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            let parsed: Record<string, unknown> | null = null;
            try {
              parsed = JSON.parse(data);
            } catch {
              // non-JSON line
            }
            if (parsed?.type === "text_delta" && parsed.text) {
              fullContent += parsed.text as string;
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantMsg.id ? { ...m, content: fullContent } : m
                )
              );
            } else if (parsed?.type === "error") {
              throw new Error((parsed.message as string) ?? "AI service error");
            }
          }
        }
      }

      // Mark as done streaming
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsg.id ? { ...m, streaming: false } : m
        )
      );

      // Persist to parent
      const updatedMessages = await fetch(`/api/documents/${documentId}/chat`)
        .then(r => r.json())
        .catch(() => []);
      if (Array.isArray(updatedMessages)) {
        onMessagesUpdate(updatedMessages);
      }

      // Fetch follow-up suggestions
      fetch("/api/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: documentId, section_id: sectionId ?? null }),
      })
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data.followups)) setFollowups(data.followups);
        })
        .catch(() => {});

    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id
              ? { ...m, content: "Sorry, something went wrong. Please try again.", streaming: false }
              : m
          )
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [documentId, streaming, onMessagesUpdate, messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop (mobile) */}
      <div
        className="fixed inset-0 z-30 bg-black/20 md:hidden"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        id="chat-panel"
        className="fixed right-0 top-0 h-full z-40 flex flex-col shadow-2xl no-print"
        style={{
          width: "min(420px, 100vw)",
          background: "white",
          borderLeft: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <h2 className="font-bold text-sm" style={{ fontFamily: "'Playfair Display', serif" }}>
              Document Chat
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Ask anything about this document
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-xl leading-none ml-4"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Close chat"
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <p className="text-3xl mb-3">💬</p>
              <p className="text-sm font-medium mb-1">Chat with your document</p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Ask questions, fact-check claims, or explore any section in depth.
              </p>
            </div>
          )}

          {messages.map(m => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
                style={
                  m.role === "user"
                    ? { background: "var(--accent)", color: "white", borderBottomRightRadius: 4 }
                    : { background: "var(--bg-secondary)", color: "var(--text-primary)", borderBottomLeftRadius: 4 }
                }
              >
                {m.role === "assistant" ? (
                  m.content ? (
                    <>
                      <div className="chat-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                      {m.streaming && (
                        <span className="inline-block w-1 h-4 ml-0.5 align-middle animate-pulse" style={{ background: "var(--text-secondary)", borderRadius: 1 }} />
                      )}
                    </>
                  ) : (m.streaming ? <ThinkingDots /> : null)
                ) : (
                  <>
                    {m.content}
                    {m.streaming && m.content && (
                      <span className="inline-block w-1 h-4 ml-0.5 align-middle animate-pulse" style={{ background: "var(--text-secondary)", borderRadius: 1 }} />
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {/* Follow-up suggestions */}
          {followups.length > 0 && !streaming && (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Suggested follow-ups</p>
              {followups.map((q, i) => (
                <button
                  key={i}
                  onClick={() => { setFollowups([]); sendMessage(q); }}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors hover:border-current"
                  style={{ borderColor: "var(--border)", color: "var(--accent)" }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 px-4 pb-4 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question…"
              rows={1}
              disabled={streaming}
              className="flex-1 resize-none rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
              style={{
                borderColor: "var(--border)",
                maxHeight: 120,
                lineHeight: 1.5,
              }}
            />
            {streaming ? (
              <button
                type="button"
                onClick={handleStop}
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors hover:bg-red-50"
                style={{ borderColor: "var(--border)" }}
                aria-label="Stop"
              >
                <span className="w-3 h-3 rounded-sm" style={{ background: "var(--accent)" }} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white disabled:opacity-40 transition-opacity"
                style={{ background: "var(--accent)" }}
                aria-label="Send"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            )}
          </form>
          <p className="text-xs mt-2 text-center" style={{ color: "var(--text-secondary)" }}>
            ↵ to send · Shift+↵ for new line
          </p>
        </div>
      </div>
    </>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex gap-1 items-center">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full animate-bounce"
          style={{
            background: "var(--text-secondary)",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </span>
  );
}
