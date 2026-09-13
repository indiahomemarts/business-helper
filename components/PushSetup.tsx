"use client";

import { useEffect, useState } from "react";

type Status = "checking" | "unsupported" | "denied" | "not_subscribed" | "subscribed" | "error";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function PushSetup() {
  const [status, setStatus] = useState<Status>("checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    const reg = await navigator.serviceWorker.register("/sw.js");
    const sub = await reg.pushManager.getSubscription();
    setStatus(sub ? "subscribed" : "not_subscribed");
  }

  async function enableNotifications() {
    setErrorMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY — set it in your environment variables.");
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error("Server rejected the subscription.");

      setStatus("subscribed");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Something went wrong enabling notifications.");
      setStatus("error");
    }
  }

  if (status === "checking") {
    return <p className="text-sm text-ink-muted">Checking notification status…</p>;
  }

  if (status === "unsupported") {
    return (
      <p className="text-sm text-ink-muted">
        This browser doesn't support push notifications. Open this page in Chrome on Android for
        the full experience.
      </p>
    );
  }

  if (status === "subscribed") {
    return (
      <div className="flex items-center gap-2 text-sm text-good">
        <CheckIcon /> Notifications are on for this device.
      </div>
    );
  }

  if (status === "denied") {
    return (
      <p className="text-sm text-urgent">
        Notifications are blocked for this site. Open Chrome's site settings for this page and
        allow notifications, then reload.
      </p>
    );
  }

  return (
    <div>
      <button
        onClick={enableNotifications}
        className="w-full rounded-lg bg-cocoa px-4 py-3 text-center text-[15px] font-medium text-paper active:bg-cocoa-dark"
      >
        Turn on notifications
      </button>
      {errorMsg && <p className="mt-2 text-sm text-urgent">{errorMsg}</p>}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
