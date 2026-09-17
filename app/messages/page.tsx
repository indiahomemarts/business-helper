"use client";

import { useEffect, useState, Suspense } from "react";
import type { ChatMessageRow } from "@/lib/types";

interface MessageWithActions extends ChatMessageRow {
  translation?: string;
  conclusion?: string;
  replies?: string[];
  loadingAction?: string | null;
}

function MessagesPageInner() {
  const [messages, setMessages] = useState<MessageWithActions[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMsgId, setOpenMsgId] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/messages/list");
      const data = await res.json();
      setMessages((data.messages || []).map((m: ChatMessageRow) => ({ ...m })));
    } finally {
      setLoading(false);
    }
  }

  async function runAiTool(
    msgId: number,
    action: "translate" | "conclusion" | "generate_reply"
  ) {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, loadingAction: action } : m))
    );

    try {
      const msg = messages.find((m) => m.id === msgId);
      if (!msg) return;

      const res = await fetch("/api/messages/ai-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          text: msg.message,
          messages: [{ sender: msg.sender, message: msg.message }],
        }),
      });

      const data = await res.json();

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId) return m;
          return {
            ...m,
            loadingAction: null,
            translation: action === "translate" ? data.translation : m.translation,
            conclusion: action === "conclusion" ? data.conclusion : m.conclusion,
            replies: action === "generate_reply" ? data.replies : m.replies,
          };
        })
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, loadingAction: null } : m))
      );
    }
  }

  function copyText(text: string, key: string) {
    navigator.clipboard?.writeText(text);
    setCopiedIdx(key);
    setTimeout(() => setCopiedIdx(null), 1500);
  }

  function formatDate(iso: string) {
    try {
      return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  // Group messages by subject/ticket
  const grouped = new Map<string, MessageWithActions[]>();
  for (const m of messages) {
    const key = m.subject || `Ticket #${m.ticket_id}`;
    const list = grouped.get(key) || [];
    list.push(m);
    grouped.set(key, list);
  }

  return (
    <main>
      <header className="px-4 pb-3 pt-6">
        <h1 className="text-xl font-semibold text-ink">Messages</h1>
        <p className="text-sm text-ink-muted">All ShopDeck communications</p>
      </header>

      {loading && (
        <p className="px-4 py-6 text-sm text-ink-muted">Loading messages…</p>
      )}

      {!loading && messages.length === 0 && (
        <div className="px-4 py-10 text-center">
          <p className="text-2xl mb-2">💬</p>
          <p className="text-sm text-ink-muted">No messages synced yet.</p>
        </div>
      )}

      <div className="space-y-1 px-4 pb-6">
        {Array.from(grouped.entries()).map(([subject, msgs]) => (
          <div key={subject} className="rounded-xl border border-border bg-surface overflow-hidden">
            {/* Thread Header */}
            <div className="px-4 py-2.5 bg-paper border-b border-border">
              <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide">{subject}</p>
            </div>

            {msgs.map((m) => (
              <div key={m.id} className="border-b border-border last:border-b-0">
                {/* Message Row */}
                <button
                  onClick={() => setOpenMsgId(openMsgId === m.id ? null : m.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left"
                >
                  <div className="shrink-0 mt-0.5">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        m.sender === "seller"
                          ? "bg-cocoa/20 text-cocoa"
                          : "bg-ink-faint/20 text-ink-muted"
                      }`}
                    >
                      {m.sender === "seller" ? "Y" : "S"}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink-faint mb-0.5">
                      {m.sender === "seller" ? "You" : "ShopDeck"} · {formatDate(m.sent_at)}
                    </p>
                    <p className="text-sm text-ink line-clamp-2">{m.message}</p>
                  </div>
                  <ChevronIcon open={openMsgId === m.id} />
                </button>

                {/* Expanded: AI Tools & Results */}
                {openMsgId === m.id && (
                  <div className="bg-paper border-t border-border px-4 py-3 space-y-3">
                    {/* Full message */}
                    <div className="rounded-lg bg-surface border border-border px-3 py-2.5 text-sm text-ink">
                      <p className="text-xs font-medium text-ink-faint mb-1">Full message:</p>
                      <p className="leading-relaxed">{m.message}</p>
                    </div>

                    {/* AI Action Buttons */}
                    <div className="flex gap-2 flex-wrap">
                      <AiButton
                        icon="🌐"
                        label="Translate"
                        loading={m.loadingAction === "translate"}
                        done={!!m.translation}
                        onClick={() => runAiTool(m.id, "translate")}
                      />
                      <AiButton
                        icon="💡"
                        label="Conclusion"
                        loading={m.loadingAction === "conclusion"}
                        done={!!m.conclusion}
                        onClick={() => runAiTool(m.id, "conclusion")}
                      />
                      <AiButton
                        icon="✍️"
                        label="Generate Reply"
                        loading={m.loadingAction === "generate_reply"}
                        done={!!m.replies?.length}
                        onClick={() => runAiTool(m.id, "generate_reply")}
                      />
                    </div>

                    {/* Translation Result */}
                    {m.translation && (
                      <div className="rounded-lg bg-surface border border-border px-3 py-2.5">
                        <p className="text-xs font-medium text-ink-faint mb-1">🌐 Gujarati Translation:</p>
                        <p className="text-sm text-ink">{m.translation}</p>
                        <button
                          onClick={() => copyText(m.translation!, `trans-${m.id}`)}
                          className="mt-1.5 text-xs text-cocoa underline"
                        >
                          {copiedIdx === `trans-${m.id}` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    )}

                    {/* Conclusion Result */}
                    {m.conclusion && (
                      <div className="rounded-lg bg-cocoa/10 border border-cocoa/30 px-3 py-2.5">
                        <p className="text-xs font-medium text-ink-faint mb-1">💡 Conclusion (Gujlish):</p>
                        <p className="text-sm font-semibold text-cocoa">{m.conclusion}</p>
                        <button
                          onClick={() => copyText(m.conclusion!, `conc-${m.id}`)}
                          className="mt-1.5 text-xs text-cocoa underline"
                        >
                          {copiedIdx === `conc-${m.id}` ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    )}

                    {/* Reply Suggestions */}
                    {m.replies && m.replies.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-ink-faint mb-1.5">✍️ Suggested Replies:</p>
                        <div className="space-y-2">
                          {m.replies.map((reply, i) => (
                            <button
                              key={i}
                              onClick={() => copyText(reply, `reply-${m.id}-${i}`)}
                              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm text-ink"
                            >
                              {reply}
                              {copiedIdx === `reply-${m.id}-${i}` && (
                                <span className="ml-2 text-xs text-good">Copied!</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}

function AiButton({
  icon,
  label,
  loading,
  done,
  onClick,
}: {
  icon: string;
  label: string;
  loading: boolean;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
        done
          ? "border-cocoa bg-cocoa/10 text-cocoa"
          : "border-border bg-surface text-ink-muted"
      } disabled:opacity-50`}
    >
      <span>{icon}</span>
      <span>{loading ? "…" : label}</span>
    </button>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9C9188"
      strokeWidth="2"
      className={`mt-1 flex-none transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesPageInner />
    </Suspense>
  );
}
