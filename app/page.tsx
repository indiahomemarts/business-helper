"use client";

import { useEffect, useState, useRef } from "react";
import type { RtoSummary } from "@/lib/types";

interface Summary {
  counts: { pendingNdr: number; pendingRtoInward: number; ticketsNeedingReview: number };
  rtoSummary: RtoSummary | null;
  lastScrapeOrdersNdr: string | null;
  lastScrapeTicketsChat: string | null;
  lastScrapeOk: boolean;
}

export default function DashboardPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inward Entry State
  const [awbInput, setAwbInput] = useState("");
  const [fileInput, setFileInput] = useState<File | null>(null);
  const [entryNotes, setEntryNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [todayEntries, setTodayEntries] = useState<Array<{ awb_number: string; file_name: string | null; created_at: string }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Baseline modal
  const [showBaseline, setShowBaseline] = useState(false);
  const [baselineInput, setBaselineInput] = useState("");
  const [baselineSaving, setBaselineSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, entriesRes] = await Promise.all([
        fetch("/api/dashboard/summary"),
        fetch("/api/rto/inward-entry"),
      ]);
      if (!dashRes.ok) throw new Error("Failed to load dashboard.");
      const dashData = await dashRes.json();
      setData(dashData);

      if (entriesRes.ok) {
        const entriesData = await entriesRes.json();
        const now = new Date();
        const istFormatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
        const todayStr = istFormatter.format(now);
        const recent = (entriesData.entries || []).filter((e: any) =>
          istFormatter.format(new Date(e.created_at)) === todayStr
        );
        setTodayEntries(recent);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function submitInwardEntry() {
    if (!awbInput.trim()) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const form = new FormData();
      form.set("awb_number", awbInput.trim().toUpperCase());
      form.set("notes", entryNotes);
      if (fileInput) form.set("file", fileInput);

      const res = await fetch("/api/rto/inward-entry", { method: "POST", body: form });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to save.");

      setSubmitMsg({ type: "ok", text: `✅ AWB ${awbInput.trim().toUpperCase()} inwarded successfully.` });
      setAwbInput("");
      setEntryNotes("");
      setFileInput(null);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (err: any) {
      setSubmitMsg({ type: "err", text: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function saveBaseline() {
    const val = parseInt(baselineInput, 10);
    if (isNaN(val) || val < 0) return;
    setBaselineSaving(true);
    try {
      const res = await fetch("/api/rto/set-baseline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initial_total: val }),
      });
      if (!res.ok) throw new Error("Failed to save baseline.");
      setShowBaseline(false);
      setBaselineInput("");
      load();
    } catch {
      // keep modal open
    } finally {
      setBaselineSaving(false);
    }
  }

  function formatTime(iso: string) {
    try {
      return new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  const rto = data?.rtoSummary;

  return (
    <main className="pb-28">
      <header className="px-4 pb-3 pt-6">
        <h1 className="text-xl font-semibold text-ink">Today</h1>
        <p className="text-sm text-ink-muted">Your ShopDeck store, at a glance</p>
      </header>

      {!loading && data && !data.lastScrapeOk && (
        <div className="mx-4 mb-3 rounded-lg bg-urgent-bg px-4 py-3 text-sm text-urgent">
          Scraper couldn't reach ShopDeck — session may have expired.{" "}
          <a href="/settings" className="font-medium underline">Fix in Settings</a>
        </div>
      )}

      {/* Quick Stats */}
      <section className="grid grid-cols-3 gap-2 px-4">
        <CountTile label="NDR to call" value={data?.counts.pendingNdr} href="/ndr" />
        <CountTile label="Missing RTO" value={data?.counts.pendingRtoInward} href="/rto" urgent={!!data?.rtoSummary?.reconciliationMismatch} />
        <CountTile label="Tickets" value={data?.counts.ticketsNeedingReview} href="/tickets" urgent={(data?.counts.ticketsNeedingReview ?? 0) > 0} />
      </section>

      {/* RTO Section */}
      <section className="mt-5">
        <div className="flex items-center justify-between px-4 mb-2">
          <h2 className="text-sm font-medium text-ink-muted">RTO Overview</h2>
          <button
            onClick={() => setShowBaseline(true)}
            className="text-xs text-cocoa underline"
          >
            Set baseline
          </button>
        </div>

        <div className="mx-4 rounded-xl border border-border bg-surface overflow-hidden shadow-card">
          {/* Key RTO Metrics */}
          <div className="grid grid-cols-2 divide-x divide-y divide-border">
            <MetricCell
              label="Total RTO"
              value={loading ? "–" : String(rto?.totalRto ?? "–")}
              sub={rto ? `Baseline: ${rto.initialBaseline} + ${rto.newRtoCount} new` : undefined}
            />
            <MetricCell
              label="In Transit"
              value={loading ? "–" : String(rto?.intransitCount ?? "–")}
              tone={rto && rto.intransitDroppedAwbs.length > 0 ? "urgent" : "normal"}
              sub={rto?.intransitDroppedAwbs.length ? `⚠️ ${rto.intransitDroppedAwbs.length} dropped` : undefined}
            />
            <MetricCell
              label={`Delivered Today${rto?.isAfter7Pm ? " (after 7 PM)" : ""}`}
              value={loading ? "–" : String(rto?.deliveredTodayCount ?? "–")}
              tone={rto?.isAfter7Pm && rto.reconciliationMismatch ? "urgent" : rto?.isAfter7Pm ? "good" : "normal"}
            />
            <MetricCell
              label="Inwarded Today"
              value={loading ? "–" : String(rto?.inwardedTodayCount ?? "–")}
              tone={rto?.isAfter7Pm
                ? rto.inwardedTodayCount === rto.deliveredTodayCount ? "good" : "urgent"
                : "normal"}
            />
          </div>

          {/* After 7 PM Reconciliation Alert */}
          {rto?.isAfter7Pm && rto.reconciliationMismatch && (
            <div className="border-t border-urgent/30 bg-urgent-bg px-4 py-3">
              <p className="text-sm font-semibold text-urgent mb-1">
                ⚠️ Mismatch after 7 PM — {rto.missingDeliveredAwbs.length} AWB{rto.missingDeliveredAwbs.length !== 1 ? "s" : ""} not inwarded
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {rto.missingDeliveredAwbs.map((awb) => (
                  <span key={awb} className="font-mono text-xs bg-surface border border-urgent/40 text-urgent px-2 py-0.5 rounded">
                    {awb}
                  </span>
                ))}
              </div>
              <p className="text-xs text-urgent/80 mt-2">These parcels are marked as delivered by the courier today but you have not added them as inwarded yet.</p>
            </div>
          )}

          {/* After 7 PM — All good */}
          {rto?.isAfter7Pm && !rto.reconciliationMismatch && (rto.deliveredTodayCount > 0 || rto.inwardedTodayCount > 0) && (
            <div className="border-t border-good/30 bg-good-bg px-4 py-3">
              <p className="text-sm font-medium text-good">✅ All delivered RTOs accounted for today!</p>
            </div>
          )}

          {/* In Transit Drop Alert */}
          {rto && rto.intransitDroppedAwbs.length > 0 && (
            <div className="border-t border-urgent/30 bg-urgent-bg px-4 py-3">
              <p className="text-sm font-semibold text-urgent mb-1">
                🚨 In-Transit Drop Detected — possible missing parcels
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {rto.intransitDroppedAwbs.map((awb) => (
                  <span key={awb} className="font-mono text-xs bg-surface border border-urgent/40 text-urgent px-2 py-0.5 rounded">
                    {awb}
                  </span>
                ))}
              </div>
              <p className="text-xs text-urgent/80 mt-2">These AWBs disappeared from In-Transit without becoming Delivered. Check with the logistics partner.</p>
            </div>
          )}
        </div>
      </section>

      {/* Quick Inward Entry */}
      <section className="mt-5 px-4">
        <h2 className="text-sm font-medium text-ink-muted mb-2">Add Inward Entry</h2>
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3 shadow-card">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint mb-1">
              AWB Number
            </label>
            <input
              value={awbInput}
              onChange={(e) => setAwbInput(e.target.value.toUpperCase())}
              placeholder="e.g. 14325613983456"
              className="w-full rounded-lg border border-border bg-paper px-3 py-2.5 text-sm font-mono text-ink outline-none focus:border-cocoa"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint mb-1">
              Proof File (Image / PDF / etc.)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setFileInput(e.target.files?.[0] || null)}
              className="w-full text-sm text-ink-muted"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-ink-faint mb-1">
              Notes (optional)
            </label>
            <input
              value={entryNotes}
              onChange={(e) => setEntryNotes(e.target.value)}
              placeholder="Any remarks…"
              className="w-full rounded-lg border border-border bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-cocoa"
            />
          </div>

          {submitMsg && (
            <p className={`text-sm ${submitMsg.type === "ok" ? "text-good" : "text-urgent"}`}>
              {submitMsg.text}
            </p>
          )}

          <button
            onClick={submitInwardEntry}
            disabled={!awbInput.trim() || submitting}
            className="w-full rounded-lg bg-cocoa px-4 py-3 text-[15px] font-medium text-paper active:bg-cocoa-dark disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save Inward Entry"}
          </button>
        </div>

        {/* Today's Entries */}
        {todayEntries.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint mb-2">
              Inwarded Today ({todayEntries.length})
            </p>
            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              {todayEntries.map((e, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-ink truncate">{e.awb_number}</p>
                    {e.file_name && (
                      <p className="text-xs text-ink-muted truncate">📎 {e.file_name}</p>
                    )}
                  </div>
                  <span className="text-xs text-ink-faint shrink-0 ml-2">{formatTime(e.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Baseline Modal */}
      {showBaseline && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setShowBaseline(false)}>
          <div
            className="w-full rounded-t-2xl bg-surface p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-ink">Set Initial RTO Total</h3>
            <p className="text-sm text-ink-muted">
              Enter the total RTO count as it stands right now on ShopDeck. This becomes the baseline. New RTOs from today onwards are tracked separately.
            </p>
            <input
              type="number"
              value={baselineInput}
              onChange={(e) => setBaselineInput(e.target.value)}
              placeholder="e.g. 25"
              className="w-full rounded-lg border border-border bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-cocoa"
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowBaseline(false)}
                className="rounded-lg border border-border px-4 py-2.5 text-sm text-ink"
              >
                Cancel
              </button>
              <button
                onClick={saveBaseline}
                disabled={baselineSaving || !baselineInput}
                className="rounded-lg bg-cocoa px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
              >
                {baselineSaving ? "Saving…" : "Save Baseline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function CountTile({
  label,
  value,
  href,
  urgent,
}: {
  label: string;
  value: number | undefined;
  href: string;
  urgent?: boolean;
}) {
  return (
    <a
      href={href}
      className={`flex flex-col items-start gap-1 rounded-lg border px-3 py-3 shadow-card ${
        urgent
          ? "border-urgent/40 bg-urgent-bg"
          : "border-border bg-surface"
      }`}
    >
      <span className={`font-mono text-2xl font-medium tabular ${urgent ? "text-urgent" : "text-ink"}`}>
        {value ?? "–"}
      </span>
      <span className={`text-xs leading-tight ${urgent ? "text-urgent/80" : "text-ink-muted"}`}>{label}</span>
    </a>
  );
}

function MetricCell({
  label,
  value,
  sub,
  tone = "normal",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "normal" | "urgent" | "good";
}) {
  const valueColor =
    tone === "urgent" ? "text-urgent" : tone === "good" ? "text-good" : "text-ink";

  return (
    <div className="px-4 py-3">
      <p className={`font-mono text-xl font-semibold ${valueColor}`}>{value}</p>
      <p className="text-xs text-ink-muted mt-0.5 leading-snug">{label}</p>
      {sub && <p className="text-xs mt-0.5 text-ink-faint">{sub}</p>}
    </div>
  );
}
