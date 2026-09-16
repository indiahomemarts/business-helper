/**
 * The scraper notifies the deployed Next.js app to send Web Push notifications
 * and run Gemini AI evaluations. If APP_URL is not configured (e.g. during local runs),
 * alerts are persisted directly to Supabase as a fallback.
 */
import { supabase } from "./supabaseClient.js";

const APP_URL = process.env.APP_URL; // e.g. https://your-app.vercel.app
const SECRET = process.env.INTERNAL_API_SECRET;

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
  if (APP_URL && SECRET) {
    try {
      const res = await fetch(`${APP_URL}/api/cron/raise-alert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SECRET}`,
        },
        body: JSON.stringify(alert),
      });
      if (res.ok) return;
      console.warn("raiseAlert HTTP failed, falling back to direct DB insert:", res.status);
    } catch (err: any) {
      console.warn("raiseAlert fetch failed, falling back to direct DB insert:", err.message);
    }
  }

  // Fallback: insert directly into Supabase alerts table
  try {
    await supabase.from("alerts").insert({
      type: alert.type,
      awb_number: alert.awb_number || null,
      ticket_id: alert.ticket_id || null,
      title: alert.title,
      body: alert.alertBody || null,
      is_read: false,
    });
  } catch (dbErr) {
    console.error("Failed to insert alert into Supabase:", dbErr);
  }
}

export async function evaluateResolution(ticketId: string) {
  if (!APP_URL || !SECRET) {
    console.log(`[evaluateResolution] Skipped webhook (APP_URL or INTERNAL_API_SECRET not set) for ticket #${ticketId}`);
    return;
  }
  try {
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
  } catch (err: any) {
    console.error("evaluateResolution network error:", err.message);
  }
}
