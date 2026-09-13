/**
 * The scraper does NOT send push notifications or call Gemini directly — it
 * asks the deployed Next.js app to do that, so there's exactly one place
 * (lib/push.ts and lib/gemini.ts in the main app) that owns those side
 * effects. This keeps the scraper a thin "collect data" layer.
 */

const APP_URL = process.env.APP_URL; // e.g. https://your-app.vercel.app
const SECRET = process.env.INTERNAL_API_SECRET;

function assertConfigured() {
  if (!APP_URL || !SECRET) {
    throw new Error(
      "Missing APP_URL or INTERNAL_API_SECRET. Set these as GitHub Actions secrets."
    );
  }
}

export type AlertType =
  | "fake_attempt"
  | "missing_parcel"
  | "unresolved_ticket"
  | "session_expired"
  | "ticket_resolved"
  | "new_agent_message";

export async function raiseAlert(alert: {
  type: AlertType;
  awb_number?: string;
  ticket_id?: string;
  title: string;
  alertBody?: string;
}) {
  assertConfigured();
  const res = await fetch(`${APP_URL}/api/cron/raise-alert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify(alert),
  });
  if (!res.ok) {
    console.error("raiseAlert failed:", res.status, await res.text().catch(() => ""));
  }
}

export async function evaluateResolution(ticketId: string) {
  assertConfigured();
  const res = await fetch(`${APP_URL}/api/cron/evaluate-resolution`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify({ ticket_id: ticketId }),
  });
  if (!res.ok) {
    console.error(
      "evaluateResolution failed:",
      res.status,
      await res.text().catch(() => "")
    );
  }
}
