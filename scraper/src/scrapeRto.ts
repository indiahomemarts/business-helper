/**
 * Scrapes /orders/rto/intransit and /orders/rto/delivered,
 * and updates rto_status and delivered_at on matching orders in Supabase in batch.
 */
import {
  openAuthenticatedContext,
  assertNotLoggedOut,
  SHOPDECK_BASE,
  SessionExpiredError,
} from "./shopdeckSession.js";
import { logCandidateJsonApis } from "./networkSniffer.js";
import { raiseAlert } from "./apiClient.js";
import { supabase } from "./supabaseClient.js";

interface ScrapedRtoRow {
  awbNumber: string;
  orderId: string | null;
  customerName: string | null;
  rawStatus: string | null;
  rtoStatus: string;
  deliveredAt?: string | null;
}

function parseDeliveryDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  try {
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  } catch {
    return null;
  }
}

async function scrapeRtoPages(): Promise<ScrapedRtoRow[]> {
  const { browser, context } = await openAuthenticatedContext();
  const page = await context.newPage();
  logCandidateJsonApis(page, /rto|return/i);

  const results: Map<string, ScrapedRtoRow> = new Map();
  let sessionValid = false;

  page.on("response", async (res) => {
    const url = res.url();
    const status = res.status();

    if (status === 200) {
      sessionValid = true;

      // Handle RTO in-transit API
      if (url.includes("/return-order/rto/intransit")) {
        try {
          const json = await res.json();
          const items = json?.data || [];
          for (const item of items) {
            const awb = item.shipping_details?.awb_no?.trim();
            if (!awb) continue;
            results.set(awb, {
              awbNumber: awb,
              orderId: item.order_details?.order_id?.trim() || null,
              customerName: item.customer_info?.customer_name?.trim() || null,
              rawStatus: item.order_status?.status?.label || "RTO INITIATED",
              rtoStatus: "RTO_IN_TRANSIT",
            });
          }
        } catch (e) {
          console.error("Error parsing RTO in-transit response:", e);
        }
      }

      // Handle RTO delivered API
      if (url.includes("/return-order/rto/delivered")) {
        try {
          const json = await res.json();
          const items = json?.data || [];
          for (const item of items) {
            const awb = item.shipping_details?.awb_no?.trim();
            if (!awb) continue;
            results.set(awb, {
              awbNumber: awb,
              orderId: item.order_details?.order_id?.trim() || null,
              customerName: item.customer_info?.customer_name?.trim() || null,
              rawStatus: item.order_status?.status?.label || "RTO DELIVERED",
              rtoStatus: "RTO_DELIVERED",
              deliveredAt: parseDeliveryDate(item.delivery_details?.delivery_date) || new Date().toISOString(),
            });
          }
        } catch (e) {
          console.error("Error parsing RTO delivered response:", e);
        }
      }
    }
  });

  try {
    // 1. Visit RTO In-Transit page
    console.log("Navigating to RTO in-transit page...");
    await page.goto(`${SHOPDECK_BASE}/orders/rto/intransit`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    assertNotLoggedOut(page.url());
    await page.waitForTimeout(2000);

    // 2. Visit RTO Delivered page
    console.log("Navigating to RTO delivered page...");
    await page.goto(`${SHOPDECK_BASE}/orders/rto/delivered`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    }).catch((e) => console.warn("RTO delivered page navigation note:", e.message));
    await page.waitForTimeout(2000);

    if (!sessionValid && results.size === 0) {
      throw new SessionExpiredError("ShopDeck session returned no valid RTO data.");
    }

    return Array.from(results.values());
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  try {
    const rows = await scrapeRtoPages();
    console.log(`Scraped ${rows.length} RTO rows.`);

    if (rows.length > 0) {
      const payload = rows.map((r) => ({
        awb_number: r.awbNumber,
        rto_status: r.rtoStatus,
        order_status: r.rawStatus,
        ...(r.orderId ? { order_id: r.orderId } : {}),
        ...(r.customerName ? { customer_name: r.customerName } : {}),
        ...(r.deliveredAt ? { delivered_at: r.deliveredAt } : {}),
        last_seen_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from("orders").upsert(payload, {
        onConflict: "awb_number",
      });
      if (error) console.error("Error batch upserting RTO orders:", error);
    }
  } catch (err) {
    console.error("RTO scrape failed:", err);
    await raiseAlert({
      type: "session_expired",
      title: "RTO scrape failed",
      alertBody: err instanceof Error ? err.message : "Unknown error — check the GitHub Actions log.",
    });
    process.exitCode = 1;
  }
}

main();
