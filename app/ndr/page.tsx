"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import StatusBadge from "@/components/StatusBadge";
import { NDR_CALL_STATUS_LABELS, type NdrCallStatus } from "@/lib/types";

interface NdrOrder {
  awb_number: string;
  order_id: string | null;
  customer_name: string | null;
  order_status: string | null;
  attempt_history: number[];
  latest_attempt_number: number | null;
  is_fake_attempt: boolean;
  already_called: boolean;
}

function NdrPageInner() {
  const params = useSearchParams();
  const [orders, setOrders] = useState<NdrOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAwb, setOpenAwb] = useState<string | null>(params.get("awb"));

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/ndr/list");
      const data = await res.json();
      setOrders(data.orders || []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <header className="px-4 pb-3 pt-6">
        <h1 className="text-xl font-semibold text-ink">NDR calling</h1>
        <p className="text-sm text-ink-muted">
          {loading ? "Loading…" : `${orders.length} parcel${orders.length === 1 ? "" : "s"} pending`}
        </p>
      </header>

      <div className="border-y border-border bg-surface">
        {!loading && orders.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            No pending NDR parcels right now.
          </p>
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
    <div className="border-b border-border last:border-b-0">
      <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-ink">{order.awb_number}</span>
            {order.is_fake_attempt && <StatusBadge tone="urgent">Fake 3rd attempt</StatusBadge>}
            {order.already_called && <StatusBadge tone="good">Called</StatusBadge>}
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-muted">
            {order.customer_name || "Unknown customer"} · Attempt{" "}
            {order.latest_attempt_number ?? "–"}
          </p>
        </div>
        <ChevronIcon open={open} />
      </button>
      {open && <CallLogForm order={order} onLogged={onLogged} />}
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
      onLogged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="bg-good-bg px-4 py-3 text-sm text-good">Call logged. Nice work.</div>
    );
  }

  return (
    <div className="space-y-3 bg-paper px-4 py-4">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
          What happened on the call?
        </p>
        <div className="grid grid-cols-1 gap-2">
          {(Object.keys(NDR_CALL_STATUS_LABELS) as NdrCallStatus[]).map((key) => (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className={`rounded-lg border px-3 py-2.5 text-left text-sm ${
                status === key
                  ? "border-cocoa bg-cocoa text-paper"
                  : "border-border bg-surface text-ink"
              }`}
            >
              {NDR_CALL_STATUS_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-faint">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
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
