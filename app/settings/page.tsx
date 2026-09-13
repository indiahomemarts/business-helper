"use client";

import { useEffect, useState } from "react";
import PushSetup from "@/components/PushSetup";

interface SettingsData {
  shopdeckCookieSet: boolean;
  shopdeckCookieUpdatedAt: string | null;
  lastScrapeOrdersNdr: string | null;
  lastScrapeTicketsChat: string | null;
  lastScrapeOk: boolean;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [cookieInput, setCookieInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch("/api/settings");
    if (res.ok) setData(await res.json());
  }

  async function saveCookie() {
    if (!cookieInput.trim()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopdeckCookie: cookieInput.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save.");
      setCookieInput("");
      setSaved(true);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/notifications/send", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send.");
      setTestResult(
        data.sent > 0
          ? `Sent to ${data.sent} device${data.sent === 1 ? "" : "s"}.`
          : "No devices are subscribed yet — turn on notifications below first."
      );
    } catch (err: any) {
      setTestResult(err.message);
    } finally {
      setTestSending(false);
    }
  }

  return (
    <main>
      <header className="px-4 pb-3 pt-6">
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
        <p className="text-sm text-ink-muted">Keep the scraper and notifications running</p>
      </header>

      <Section title="ShopDeck session">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-muted">Cookie status</span>
          <span className={data?.shopdeckCookieSet ? "text-good" : "text-urgent"}>
            {data?.shopdeckCookieSet ? "Set" : "Not set"}
          </span>
        </div>
        {data?.shopdeckCookieUpdatedAt && (
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-ink-muted">Last updated</span>
            <span className="text-ink">{new Date(data.shopdeckCookieUpdatedAt).toLocaleString()}</span>
          </div>
        )}

        <p className="mt-3 text-sm text-ink-muted">
          Log into ShopDeck in Chrome, open DevTools → Application → Cookies, and paste the full
          cookie value here whenever it changes (see the README for exact steps).
        </p>
        <textarea
          value={cookieInput}
          onChange={(e) => setCookieInput(e.target.value)}
          rows={3}
          placeholder="Paste the ShopDeck session cookie value here"
          className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-ink outline-none focus:border-cocoa"
        />
        {error && <p className="mt-1 text-sm text-urgent">{error}</p>}
        {saved && <p className="mt-1 text-sm text-good">Saved.</p>}
        <button
          onClick={saveCookie}
          disabled={saving || !cookieInput.trim()}
          className="mt-2 w-full rounded-lg bg-cocoa px-4 py-3 text-[15px] font-medium text-paper active:bg-cocoa-dark disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save cookie"}
        </button>
      </Section>

      <Section title="Scraper health">
        <Row label="Orders / NDR last synced" value={formatTime(data?.lastScrapeOrdersNdr)} />
        <Row label="Tickets / chat last synced" value={formatTime(data?.lastScrapeTicketsChat)} />
        <Row
          label="Last run status"
          value={data ? (data.lastScrapeOk ? "OK" : "Failed — check cookie") : "—"}
          valueClass={data && !data.lastScrapeOk ? "text-urgent" : "text-good"}
        />
      </Section>

      <Section title="Notifications">
        <PushSetup />
        <button
          onClick={sendTest}
          disabled={testSending}
          className="mt-3 w-full rounded-lg border border-border bg-surface px-4 py-3 text-[15px] font-medium text-ink active:bg-border/40"
        >
          {testSending ? "Sending…" : "Send test notification"}
        </button>
        {testResult && <p className="mt-2 text-sm text-ink-muted">{testResult}</p>}
      </Section>
    </main>
  );
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 px-4">
      <h2 className="mb-2 text-sm font-medium text-ink-muted">{title}</h2>
      <div className="rounded-lg border border-border bg-surface p-4 shadow-card">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className={valueClass || "text-ink"}>{value}</span>
    </div>
  );
}
