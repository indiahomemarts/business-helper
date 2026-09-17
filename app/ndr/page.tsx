"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import StatusBadge from "@/components/StatusBadge";
import { NDR_CALL_STATUS_LABELS, type NdrCallStatus, type NdrLog } from "@/lib/types";

interface NdrOrder {
  awb_number: string;
  order_id: string | null;
  customer_name: string | null;
  order_status: string | null;
  attempt_history: number[];
  latest_attempt_number: number | null;
  is_fake_attempt: boolean;
  already_called: boolean;
  logged_today: boolean;
  call_history: NdrLog[];
}

function formatIst(iso: string) {
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

function NdrPageInner() {
  const params = useSearchParams();
  const [orders, setOrders] = useState<NdrOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAwb, setOpenAwb] = useState<string | null>(params.get("awb"));
  const [hideLoggedToday, setHideLoggedToday] = useState(true);

  useEffect(() => {
    load();
  }, [hideLoggedToday]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/ndr/list?hide_logged_today=${hideLoggedToday}`);
      const data = await res.json();
      setOrders(data.orders || []);
    } finally {
      setLoading(false);
    }
  }

  const hiddenTodayCount = !hideLoggedToday ? orders.filter((o) => o.logged_today).length : 0;

  return (
    <main>
      <header className="px-4 pb-3 pt-6">
        <h1 className="text-xl font-semibold text-ink">NDR Calling</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          {loading ? "Loading…" : `${orders.length} parcel${orders.length === 1 ? "" : "s"} pending`}
        </p>
      </header>

      {/* Hide Logged Today Toggle */}
      <div className="flex items-center gap-3 px-4 pb-3">
        <button
          onClick={() => setHideLoggedToday(!hideLoggedToday)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${
            hideLoggedToday ? "bg-cocoa text-paper" : "bg-border/60 text-ink-muted"
          }`}
        >
          <span>{hideLoggedToday ? "Hiding Logged Today" : "Show All"}</span>
        </button>
        {!hideLoggedToday && hiddenTodayCount > 0 && (
          <span className="text-xs text-good bg-good-bg px-2 py-1 rounded-full">
            {hiddenTodayCount} logged today
          </span>
        )}
      </div>

      <div className="border-y border-border bg-surface">
        {!loading && orders.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-2xl mb-2">✅</p>
            <p className="text-sm font-medium text-ink">All done for today!</p>
            <p className="text-sm text-ink-muted mt-1">No pending NDR parcels right now.</p>
          </div>
        )}
        {orders.map((o) => (
          <NdrRow
            key={o.awb_number}
            order={o}
            open={openAwb === o.awb_number}
            onToggle={() => setOpenAwb(openAwb === o.awb_number ? null : o.awb_number)}
            onLogged={load}
          />
        ))}
      </div>
    </main>
  );
}

function NdrRow({
  order,
  open,
  onToggle,
  onLogged,
}: {
  order: NdrOrder;
  open: boolean;
  onToggle: () => void;
  onLogged: () => void;
}) {
  return (
    <div className={`border-b border-border last:border-b-0 ${order.logged_today ? "opacity-60" : ""}`}>
      <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-ink">{order.awb_number}</span>
            {order.is_fake_attempt && <StatusBadge tone="urgent">Fake 3rd attempt</StatusBadge>}
            {order.logged_today && <StatusBadge tone="good">Logged today</StatusBadge>}
            {order.call_history.length > 0 && !order.logged_today && (
              <StatusBadge tone="pending">Called before</StatusBadge>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-muted">
            {order.customer_name || "Unknown customer"} · Attempt{" "}
            {order.latest_attempt_number ?? "–"}
          </p>
        </div>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div>
          {/* Past Call History */}
          {order.call_history.length > 0 && (
            <div className="bg-paper border-t border-border px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint mb-2">
                Previous Call History
              </p>
              <div className="space-y-2">
                {order.call_history.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg border border-border bg-surface px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-ink">
                        {NDR_CALL_STATUS_LABELS[log.call_status]}
                      </span>
                      <span className="text-xs text-ink-faint shrink-0">
                        {formatIst(log.called_at)}
                      </span>
                    </div>
                    {log.notes && (
                      <p className="mt-1 text-xs text-ink-muted">{log.notes}</p>
                    )}
                    {log.attempt_count_at_call && (
                      <p className="mt-0.5 text-xs text-ink-faint">
                        Attempt #{log.attempt_count_at_call} at time of call
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Call Log Form */}
          <CallLogForm order={order} onLogged={onLogged} />
        </div>
      )}
    </div>
  );
}

function CallLogForm({ order, onLogged }: { order: NdrOrder; onLogged: () => void }) {
  const [status, setStatus] = useState<NdrCallStatus | null>(null);
  const [notes, setNotes] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!status) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("awb_number", order.awb_number);
      form.set("call_status", status);
      form.set("notes", notes);
      form.set("attempt_count_at_call", String(order.latest_attempt_number ?? ""));
      if (audio) form.set("audio", audio);

      const res = await fetch("/api/ndr/log-call", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save.");
      setDone(true);
      setTimeout(() => onLogged(), 600);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="bg-good-bg px-4 py-3 text-sm text-good flex items-center gap-2">
        <span>✅</span> Call logged. Hiding for today.
      </div>
    );
  }

  return (
    <div className="space-y-3 bg-paper px-4 py-4 border-t border-border">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        Log today's call
      </p>

      <div className="grid grid-cols-1 gap-2">
        {(Object.keys(NDR_CALL_STATUS_LABELS) as NdrCallStatus[]).map((key) => (
          <button
            key={key}
            onClick={() => setStatus(key)}
            className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
              status === key
                ? "border-cocoa bg-cocoa text-paper"
                : "border-border bg-surface text-ink"
            }`}
          >
            {NDR_CALL_STATUS_LABELS[key]}
          </button>
        ))}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="What happened on the call…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-cocoa"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Call recording (optional)
        </label>
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => setAudio(e.target.files?.[0] || null)}
          className="w-full text-sm text-ink-muted"
        />
      </div>

      {error && <p className="text-sm text-urgent">{error}</p>}

      <button
        onClick={submit}
        disabled={!status || submitting}
        className="w-full rounded-lg bg-cocoa px-4 py-3 text-[15px] font-medium text-paper active:bg-cocoa-dark disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save call log"}
      </button>
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

export default function NdrPage() {
  return (
    <Suspense fallback={null}>
      <NdrPageInner />
    </Suspense>
  );
}
