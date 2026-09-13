"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import type { TicketRow, ChatMessageRow } from "@/lib/types";

function TicketsPageInner() {
  const params = useSearchParams();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTicket, setOpenTicket] = useState<string | null>(params.get("ticket"));

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

  return (
    <main>
      <header className="px-4 pb-3 pt-6">
        <h1 className="text-xl font-semibold text-ink">Tickets & chat</h1>
        <p className="text-sm text-ink-muted">Your business partner's take on each thread</p>
      </header>

      <div className="border-y border-border bg-surface">
        {!loading && tickets.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">No tickets synced yet.</p>
        )}
        {tickets.map((t) => (
          <TicketRowItem
            key={t.ticket_id}
            ticket={t}
            open={openTicket === t.ticket_id}
            onToggle={() => setOpenTicket(openTicket === t.ticket_id ? null : t.ticket_id)}
          />
        ))}
      </div>
    </main>
  );
}

function resolutionMeta(flag: TicketRow["ai_resolution_flag"]) {
  if (flag === "resolved") return { label: "Looks resolved", tone: "good" as const };
  if (flag === "needs_review") return { label: "Needs your review", tone: "urgent" as const };
  return { label: "Not reviewed yet", tone: "neutral" as const };
}

function TicketRowItem({
  ticket,
  open,
  onToggle,
}: {
  ticket: TicketRow;
  open: boolean;
  onToggle: () => void;
}) {
  const meta = resolutionMeta(ticket.ai_resolution_flag);
  return (
    <div className="border-b border-border last:border-b-0">
      <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-ink">#{ticket.ticket_id}</span>
            <StatusBadge tone={ticket.status === "open" ? "pending" : "neutral"}>
              {ticket.status === "open" ? "Open" : "Closed"}
            </StatusBadge>
            {ticket.status === "closed" && (
              <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-muted">{ticket.subject || "No subject"}</p>
        </div>
      </button>
      {open && <TicketDetail ticket={ticket} />}
    </div>
  );
}

function TicketDetail({ ticket }: { ticket: TicketRow }) {
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

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [msgRes, sumRes] = await Promise.all([
        fetch(`/api/tickets/messages?ticket_id=${ticket.ticket_id}`),
        fetch("/api/tickets/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket_id: ticket.ticket_id }),
        }),
      ]);
      const msgData = await msgRes.json();
      setMessages(msgData.messages || []);

      if (sumRes.ok) {
        setSummary(await sumRes.json());
      } else {
        const errData = await sumRes.json().catch(() => ({}));
        throw new Error(errData.error || "Couldn't generate a summary.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function copyReply(text: string, idx: number) {
    navigator.clipboard?.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  }

  return (
    <div className="space-y-4 bg-paper px-4 py-4">
      {loading && <p className="text-sm text-ink-muted">Thinking this through…</p>}
      {error && <p className="text-sm text-urgent">{error}</p>}

      {!loading && summary && (
        <>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              What's happening (in Gujarati)
            </p>
            <p className="mt-1 text-[15px] text-ink">{summary.summary_gujarati}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              Bottom line
            </p>
            <p className="mt-1 text-[15px] font-medium text-ink">{summary.conclusion_gujarati}</p>
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

      {ticket.status === "closed" && ticket.ai_resolution_reasoning && (
        <div className="rounded-lg bg-border/40 px-3 py-2.5 text-sm text-ink-muted">
          <span className="font-medium text-ink">Why: </span>
          {ticket.ai_resolution_reasoning}
        </div>
      )}

      <button
        onClick={() => setShowThread((s) => !s)}
        className="text-sm font-medium text-cocoa underline"
      >
        {showThread ? "Hide full thread" : `Show full thread (${messages.length})`}
      </button>

      {showThread && (
        <div className="space-y-2 border-t border-border pt-3">
          {messages.map((m) => (
            <div key={m.id} className="text-sm">
              <span className="font-medium text-ink">
                {m.sender === "agent" ? "ShopDeck agent" : "You"}:
              </span>{" "}
              <span className="text-ink-muted">{m.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TicketsPage() {
  return (
    <Suspense fallback={null}>
      <TicketsPageInner />
    </Suspense>
  );
}
