"use client";

import { useEffect, useState } from "react";
import AlertRow from "@/components/AlertRow";
import type { Alert } from "@/lib/types";

interface Summary {
  alerts: Alert[];
  counts: { pendingNdr: number; pendingRtoInward: number; ticketsNeedingReview: number };
  lastScrapeOrdersNdr: string | null;
  lastScrapeTicketsChat: string | null;
  lastScrapeOk: boolean;
}

export default function DashboardPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/summary");
      if (!res.ok) throw new Error("Failed to load dashboard.");
      setData(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <header className="px-4 pb-3 pt-6">
        <h1 className="text-xl font-semibold text-ink">Today</h1>
        <p className="text-sm text-ink-muted">Your ShopDeck store, at a glance</p>
      </header>

      {!loading && data && !data.lastScrapeOk && (
        <div className="mx-4 mb-3 rounded-lg bg-urgent-bg px-4 py-3 text-sm text-urgent">
          Scraper couldn't reach ShopDeck on the last run — your session cookie may have expired.{" "}
          <a href="/settings" className="font-medium underline">
            Fix in Settings
          </a>
        </div>
      )}

      <section className="grid grid-cols-3 gap-2 px-4">
        <CountTile label="NDR to call" value={data?.counts.pendingNdr} href="/ndr" />
        <CountTile label="RTO to receive" value={data?.counts.pendingRtoInward} href="/rto" />
        <CountTile label="Tickets to review" value={data?.counts.ticketsNeedingReview} href="/tickets" />
      </section>

      <section className="mt-5">
        <h2 className="px-4 text-sm font-medium text-ink-muted">Recent alerts</h2>
        <div className="mt-2 border-y border-border bg-surface">
          {loading && <p className="px-4 py-6 text-sm text-ink-muted">Loading…</p>}
          {error && <p className="px-4 py-6 text-sm text-urgent">{error}</p>}
          {!loading && !error && data?.alerts.length === 0 && (
            <p className="px-4 py-6 text-sm text-ink-muted">
              Nothing yet. Alerts will show up here as soon as the scraper finds something worth
              your attention.
            </p>
          )}
          {!loading && data?.alerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)}
        </div>
      </section>
    </main>
  );
}

function CountTile({
  label,
  value,
  href,
}: {
  label: string;
  value: number | undefined;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex flex-col items-start gap-1 rounded-lg border border-border bg-surface px-3 py-3 shadow-card"
    >
      <span className="font-mono text-2xl font-medium tabular text-ink">{value ?? "–"}</span>
      <span className="text-xs leading-tight text-ink-muted">{label}</span>
    </a>
  );
}
