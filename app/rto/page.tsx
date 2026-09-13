"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";

interface RtoOrder {
  awb_number: string;
  order_id: string | null;
  customer_name: string | null;
  rto_status: string | null;
  inwarded_at: string | null;
  needs_inward: boolean;
}

function RtoPageInner() {
  const params = useSearchParams();
  const [orders, setOrders] = useState<RtoOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAwb, setOpenAwb] = useState<string | null>(params.get("awb"));
  const [filter, setFilter] = useState<"needs_inward" | "in_transit" | "all">("needs_inward");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/rto/list");
      const data = await res.json();
      setOrders(data.orders || []);
    } finally {
      setLoading(false);
    }
  }

  const filtered = orders.filter((o) => {
    if (filter === "needs_inward") return o.needs_inward;
    if (filter === "in_transit") return !o.needs_inward && !o.inwarded_at;
    return true;
  });

  return (
    <main>
      <header className="px-4 pb-3 pt-6">
        <h1 className="text-xl font-semibold text-ink">RTO parcels</h1>
        <p className="text-sm text-ink-muted">Track returns from ShopDeck back to you</p>
      </header>

      <div className="flex gap-2 px-4 pb-3">
        <FilterChip label="To receive" active={filter === "needs_inward"} onClick={() => setFilter("needs_inward")} />
        <FilterChip label="In transit" active={filter === "in_transit"} onClick={() => setFilter("in_transit")} />
        <FilterChip label="All" active={filter === "all"} onClick={() => setFilter("all")} />
      </div>

      <div className="border-y border-border bg-surface">
        {!loading && filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">Nothing here right now.</p>
        )}
        {filtered.map((o) => (
          <RtoRow
            key={o.awb_number}
            order={o}
            open={openAwb === o.awb_number}
            onToggle={() => setOpenAwb(openAwb === o.awb_number ? null : o.awb_number)}
            onInwarded={load}
          />
        ))}
      </div>
    </main>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm ${
        active ? "bg-cocoa text-paper" : "bg-border/60 text-ink-muted"
      }`}
    >
      {label}
    </button>
  );
}

function RtoRow({
  order,
  open,
  onToggle,
  onInwarded,
}: {
  order: RtoOrder;
  open: boolean;
  onToggle: () => void;
  onInwarded: () => void;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-ink">{order.awb_number}</span>
            {order.needs_inward && <StatusBadge tone="urgent">Awaiting scan</StatusBadge>}
            {order.inwarded_at && <StatusBadge tone="good">Received</StatusBadge>}
          </div>
          <p className="mt-0.5 truncate text-sm text-ink-muted">
            {order.customer_name || "Unknown customer"} · {order.rto_status || "—"}
          </p>
        </div>
      </button>
      {open && order.needs_inward && <InwardForm order={order} onInwarded={onInwarded} />}
    </div>
  );
}

function InwardForm({ order, onInwarded }: { order: RtoOrder; onInwarded: () => void }) {
  const [otpRequested, setOtpRequested] = useState(false);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function requestOtp() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rto/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ awb_number: order.awb_number }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to send code.");
      setOtpRequested(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/rto/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ awb_number: order.awb_number, otp_code: otp }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Incorrect code.");
      setDone(true);
      onInwarded();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <div className="bg-good-bg px-4 py-3 text-sm text-good">Marked as received.</div>;
  }

  return (
    <div className="space-y-3 bg-paper px-4 py-4">
      {!otpRequested ? (
        <>
          <p className="text-sm text-ink-muted">
            You'll get a code as a notification on your phone — enter it here to confirm this
            parcel physically arrived.
          </p>
          <button
            onClick={requestOtp}
            disabled={busy}
            className="w-full rounded-lg bg-cocoa px-4 py-3 text-[15px] font-medium text-paper active:bg-cocoa-dark disabled:opacity-50"
          >
            {busy ? "Sending…" : "Mark as received"}
          </button>
        </>
      ) : (
        <>
          <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint">
            Enter the 6-digit code
          </label>
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            inputMode="numeric"
            maxLength={6}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-center font-mono text-lg tracking-widest text-ink outline-none focus:border-cocoa"
          />
          <button
            onClick={verify}
            disabled={busy || otp.length !== 6}
            className="w-full rounded-lg bg-cocoa px-4 py-3 text-[15px] font-medium text-paper active:bg-cocoa-dark disabled:opacity-50"
          >
            {busy ? "Confirming…" : "Confirm receipt"}
          </button>
        </>
      )}
      {error && <p className="text-sm text-urgent">{error}</p>}
    </div>
  );
}

export default function RtoPage() {
  return (
    <Suspense fallback={null}>
      <RtoPageInner />
    </Suspense>
  );
}
