import "server-only";
import webpush from "web-push";
import { supabaseServer } from "./supabaseServer";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:you@example.com";

  if (!publicKey || !privateKey) {
    throw new Error(
      "VAPID keys are missing. Run `npm run generate-vapid` and add the keys to your environment variables."
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // where to navigate when the notification is tapped
}

/**
 * Sends a push notification to every subscribed device (in practice, just
 * your own phone's installed PWA). Subscriptions that have expired or been
 * revoked (410/404 responses) are cleaned up automatically.
 */
export async function sendPushToAllSubscribers(payload: PushPayload) {
  ensureConfigured();

  const { data: subs, error } = await supabaseServer
    .from("push_subscriptions")
    .select("*");

  if (error) throw error;
  if (!subs || subs.length === 0) return { sent: 0, removed: 0 };

  let sent = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        sent += 1;
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          // Subscription is dead (user uninstalled the PWA, cleared data, etc.)
          await supabaseServer
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint);
          removed += 1;
        } else {
          console.error("Push send failed:", err);
        }
      }
    })
  );

  return { sent, removed };
}

/**
 * Convenience helper used everywhere an alert needs to be raised: writes the
 * alert row (so it shows up in the dashboard) AND pushes it to the phone.
 */
export async function raiseAlert(alert: {
  type:
    | "fake_attempt"
    | "missing_parcel"
    | "unresolved_ticket"
    | "session_expired"
    | "ticket_resolved"
    | "new_agent_message";
  awb_number?: string | null;
  ticket_id?: string | null;
  title: string;
  body?: string | null;
}) {
  const { error } = await supabaseServer.from("alerts").insert({
    type: alert.type,
    awb_number: alert.awb_number ?? null,
    ticket_id: alert.ticket_id ?? null,
    title: alert.title,
    body: alert.body ?? null,
  });
  if (error) console.error("Failed to write alert row:", error);

  try {
    await sendPushToAllSubscribers({
      title: alert.title,
      body: alert.body || "",
      url: alert.awb_number
        ? `/ndr?awb=${alert.awb_number}`
        : alert.ticket_id
        ? `/tickets?ticket=${alert.ticket_id}`
        : "/",
    });
  } catch (err) {
    // Don't let a push failure hide the fact that the alert itself was raised.
    console.error("Failed to send push notification:", err);
  }
}
