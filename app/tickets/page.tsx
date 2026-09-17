"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import type { TicketRow, ChatMessageRow } from "@/lib/types";

type FilterTab = "action_needed" | "open" | "solved";

function TicketsPageInner() {
  const params = useSearchParams();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTicket, setOpenTicket] = useState<string | null>(params.get("ticket"));
  const [tab, setTab] = useState<FilterTab>("action_needed");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/tickets/list");
      const data = await res.json();
      setTickets(data.tickets || []);
    } finally {
      setLoading(false);
    }
  }

  const filtered = tickets.filter((t) => {
    if (tab === "action_needed") return t.is_closed_by_shopdeck && t.user_status !== "solved";
    if (tab === "open") return t.status === "open";
    if (tab === "solved") return t.user_status === "solved";
    return true;
  });

  const actionCount = tickets.filter((t) => t.is_closed_by_shopdeck && t.user_status !== "solved").length;

  return (
    <main>
      <header className="px-4 pb-3 pt-6">
        <h1 className="text-xl font-semibold text-ink">Tickets</h1>
        <p className="text-sm text-ink-muted">Manage your ShopDeck support tickets</p>
      </header>

      {/* Tab Filter */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
        <FilterChip
          label={`Needs Action${actionCount > 0 ? ` (${actionCount})` : ""}`}
          active={tab === "action_needed"}
          onClick={() => setTab("action_needed")}
          urgent={actionCount > 0}
        />
        <FilterChip label="Open" active={tab === "open"} onClick={() => setTab("open")} />
        <FilterChip label="Solved" active={tab === "solved"} onClick={() => setTab("solved")} />
      </div>

      <div className="border-y border-border bg-surface">
        {loading && <p className="px-4 py-6 text-sm text-ink-muted">Loading…</p>}
        {!loading && filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            {tab === "action_needed" ? "No tickets waiting for your action." : "No tickets here."}
          </p>
        )}
        {filtered.map((t) => (
          <TicketRowItem
            key={t.ticket_id}
            ticket={t}
            open={openTicket === t.ticket_id}
            onToggle={() => setOpenTicket(openTicket === t.ticket_id ? null : t.ticket_id)}
            onUpdate={load}
          />
        ))}
      </div>
    </main>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  urgent,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  urgent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? urgent
            ? "bg-urgent text-paper"
            : "bg-cocoa text-paper"
          : urgent
          ? "bg-urgent/10 text-urgent border border-urgent/30"
          : "bg-border/60 text-ink-muted"
      }`}
    >
      {label}
    </button>
  );
}

function TicketRowItem({
  ticket,
  open,
  onToggle,
  onUpdate,
}: {
  ticket: TicketRow;
  open: boolean;
  onToggle: () => void;
  onUpdate: () => void;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-ink">#{ticket.ticket_id}</span>

            {/* ShopDeck Status */}
            {ticket.is_closed_by_shopdeck ? (
              <StatusBadge tone="neutral">ShopDeck Closed</StatusBadge>
            ) : (
              <StatusBadge tone="pending">Open</StatusBadge>
            )}

            {/* Manual Status */}
            {ticket.user_status === "solved" && (
              <StatusBadge tone="good">You Marked Solved</StatusBadge>
            )}

            {/* Red Warning — Closed without chat */}
            {ticket.no_chat_warning && (
              <span className="inline-flex items-center gap-1 rounded-full bg-urgent px-2 py-0.5 text-[10px] font-semibold text-paper">
                ⚠️ No Discussion
              </span>
            )}
          </div>

          <p className="mt-0.5 truncate text-sm text-ink-muted">{ticket.subject || "No subject"}</p>

          {/* Last message preview */}
          {ticket.last_message_preview && (
            <p className="mt-0.5 truncate text-xs text-ink-faint">{ticket.last_message_preview}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {ticket.chat_count !== undefined && ticket.chat_count > 0 && (
            <span className="text-xs text-ink-faint">{ticket.chat_count} msg</span>
          )}
          <ChevronIcon open={open} />
        </div>
      </button>

      {/* No Chat Red Banner */}
      {ticket.no_chat_warning && (
        <div className="mx-4 mb-2 rounded-lg bg-urgent px-3 py-2 text-sm text-paper font-medium">
          ⚠️ ShopDeck closed this ticket WITHOUT any chat discussion from the support team.
        </div>
      )}

      {open && <TicketDetail ticket={ticket} onUpdate={onUpdate} />}
    </div>
  );
}

function TicketDetail({
  ticket,
  onUpdate,
}: {
  ticket: TicketRow;
  onUpdate: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [summary, setSummary] = useState<{
    summary_gujarati: string;
    conclusion_gujarati: string;
    reply_suggestions: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [showThread, setShowThread] = useState(false);
  const [markingSolved, setMarkingSolved] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [msgRes, sumRes] = await Promise.all([
        fetch(`/api/tickets/messages?ticket_id=${ticket.ticket_id}`),
        ticket.has_chat_messages
          ? fetch("/api/tickets/summarize", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ticket_id: ticket.ticket_id }),
            })
          : Promise.resolve(null),
      ]);
      const msgData = await msgRes.json();
      setMessages(msgData.messages || []);

      if (sumRes && sumRes.ok) {
        setSummary(await sumRes.json());
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function markSolved(solved: boolean) {
    setMarkingSolved(true);
    try {
      const res = await fetch("/api/tickets/mark-solved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: ticket.ticket_id, solved }),
      });
      if (!res.ok) throw new Error("Failed to update.");
      onUpdate();
    } catch {
      /* ignore */
    } finally {
      setMarkingSolved(false);
    }
  }

  function copyReply(text: string, idx: number) {
    navigator.clipboard?.writeText(text);
    setCopiedIdx(idx);
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

  return (
    <div className="space-y-4 bg-paper px-4 py-4 border-t border-border">
      {loading && <p className="text-sm text-ink-muted">Thinking this through…</p>}
      {error && <p className="text-sm text-urgent">{error}</p>}

      {/* AI Summary */}
      {!loading && summary && (
        <>
          <div className="rounded-lg bg-surface border border-border px-4 py-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              What's happening (Gujarati)
            </p>
            <p className="text-[15px] text-ink leading-relaxed">{summary.summary_gujarati}</p>
          </div>

          <div className="rounded-lg bg-cocoa/10 border border-cocoa/30 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint mb-1">
              Bottom Line (Gujlish)
            </p>
            <p className="text-[15px] font-semibold text-cocoa leading-snug">
              {summary.conclusion_gujarati}
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
              Suggested replies — tap to copy
            </p>
            <div className="space-y-2">
              {summary.reply_suggestions.map((r, i) => (
                <button
                  key={i}
                  onClick={() => copyReply(r, i)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-sm text-ink"
                >
                  {r}
                  {copiedIdx === i && <span className="ml-2 text-xs text-good">Copied</span>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {!loading && !summary && !ticket.has_chat_messages && (
        <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-ink-muted">
          No chat messages found for this ticket yet.
        </div>
      )}

      {/* Conversation Thread */}
      {messages.length > 0 && (
        <>
          <button
            onClick={() => setShowThread((s) => !s)}
            className="text-sm font-medium text-cocoa underline"
          >
            {showThread ? "Hide conversation" : `Show conversation (${messages.length} messages)`}
          </button>

          {showThread && (
            <div className="space-y-3 border-t border-border pt-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg px-3 py-2.5 ${
                    m.sender === "seller"
                      ? "bg-cocoa/10 border border-cocoa/20 ml-4"
                      : "bg-surface border border-border mr-4"
                  }`}
                >
                  <p className="text-xs font-semibold text-ink-faint mb-1">
                    {m.sender === "seller" ? "✉️ You told:" : "💬 ShopDeck team said:"}
                    <span className="font-normal ml-1">{formatDate(m.sent_at)}</span>
                  </p>
                  <p className="text-sm text-ink">{m.message}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Mark as Solved / Reopen */}
      <div className="pt-1 border-t border-border flex gap-2">
        {ticket.user_status !== "solved" ? (
          <button
            onClick={() => markSolved(true)}
            disabled={markingSolved}
            className="flex-1 rounded-lg bg-good px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
          >
            {markingSolved ? "Saving…" : "✅ Mark as Solved"}
          </button>
        ) : (
          <button
            onClick={() => markSolved(false)}
            disabled={markingSolved}
            className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm text-ink-muted disabled:opacity-50"
          >
            {markingSolved ? "Saving…" : "Reopen Ticket"}
          </button>
        )}
      </div>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
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

export default function TicketsPage() {
  return (
    <Suspense fallback={null}>
      <TicketsPageInner />
    </Suspense>
  );
}
