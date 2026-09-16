/**
 * Scrapes ShopDeck Orders & NDR attempts via real API interception & browsing,
 * upserts order rows into Supabase in high-performance batches,
 * and detects "fake 3rd attempt" anomalies.
 */
import {
  openAuthenticatedContext,
  assertNotLoggedOut,
  markScrapeResult,
  SHOPDECK_BASE,
  SessionExpiredError,
} from "./shopdeckSession.js";
import { logCandidateJsonApis } from "./networkSniffer.js";
import { raiseAlert } from "./apiClient.js";
import { supabase } from "./supabaseClient.js";
import { normalizeRtoStatus } from "./statusNormalizer.js";

interface ScrapedOrder {
  awbNumber: string;
  orderId: string | null;
  customerName: string | null;
  orderStatus: string | null;
  rtoStatus: string | null;
  attemptNumber?: number | null;
}

function extractAttemptNumber(statusText: string | null | undefined): number | null {
  if (!statusText) return null;
  const match = statusText.match(/attempt\s*[:#]?\s*(\d)/i) || statusText.match(/(\d)(?:st|nd|rd|th)\s*attempt/i);
  return match ? parseInt(match[1], 10) : null;
}

async function scrapeOrdersAndNdr(): Promise<ScrapedOrder[]> {
  const { browser, context } = await openAuthenticatedContext();
  const page = await context.newPage();
  logCandidateJsonApis(page, /order|track|ndr/i);

  const collectedOrders: Map<string, ScrapedOrder> = new Map();
  let sessionValid = false;

  page.on("response", async (res) => {
    const url = res.url();
    const status = res.status();

    if (status === 401) {
      console.warn(`[API 401] Unauthorized on ${url}`);
      return;
    }

    if (status === 200) {
      sessionValid = true;

      // Handle All Orders API response
      if (url.includes("/api/order-process/orders")) {
        try {
          const json = await res.json();
          const items = json?.data?.data || [];
          for (const item of items) {
            const awb = item.shipping_details?.awb_no?.trim();
            if (!awb) continue;
            collectedOrders.set(awb, {
              awbNumber: awb,
              orderId: item.order_details?.order_id?.trim() || null,
              customerName: item.customer_details?.name?.trim() || null,
              orderStatus: item.order_status?.status?.label || item.order_status?.label || null,
              rtoStatus: normalizeRtoStatus(item.order_status?.status?.label || null),
            });
          }
        } catch (e) {
          console.error("Error parsing orders response:", e);
        }
      }

      // Handle NDR API response
      if (url.includes("/api/non-deliverables/ndr")) {
        try {
          const json = await res.json();
          const items = json?.data?.data || [];
          for (const item of items) {
            const awb = item.shipping_details?.awb_no?.trim();
            if (!awb) continue;
            const attemptCount =
              Number(item.ndr_info?.attempt_count) ||
              extractAttemptNumber(item.ndr_info?.ndr_reason) ||
              null;
            const reason = item.ndr_info?.ndr_reason;
            const statusLabel = reason ? `NDR - ${reason}` : "NDR Pending";

            const existing = collectedOrders.get(awb);
            collectedOrders.set(awb, {
              awbNumber: awb,
              orderId: item.order_details?.order_id?.trim() || existing?.orderId || null,
              customerName: item.customer_details?.name?.trim() || existing?.customerName || null,
              orderStatus: statusLabel,
              rtoStatus: existing?.rtoStatus || null,
              attemptNumber: attemptCount,
            });
          }
        } catch (e) {
          console.error("Error parsing NDR response:", e);
        }
      }
    }
  });

  try {
    // 1. Visit Track Orders page
    console.log("Navigating to track orders page...");
    await page.goto(`${SHOPDECK_BASE}/orders/track-orders/all-orders`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    assertNotLoggedOut(page.url());
    await page.waitForTimeout(2000);

    // 2. Fetch wider 30-day orders list directly via authenticated context request
    try {
      const now = new Date();
      const endDate = now.toISOString().slice(0, 10);
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const res = await context.request.post(`${SHOPDECK_BASE}/api/order-process/orders`, {
        data: {
          page_no: 0,
          page_size: 100,
          filters: { start_date: startDate, end_date: endDate },
          sort: "desc",
        },
      });

      if (res.status() === 200) {
        sessionValid = true;
        const json = await res.json();
        const items = json?.data?.data || [];
        for (const item of items) {
          const awb = item.shipping_details?.awb_no?.trim();
          if (!awb) continue;
          if (!collectedOrders.has(awb)) {
            collectedOrders.set(awb, {
              awbNumber: awb,
              orderId: item.order_details?.order_id?.trim() || null,
              customerName: item.customer_details?.name?.trim() || null,
              orderStatus: item.order_status?.status?.label || item.order_status?.label || null,
              rtoStatus: normalizeRtoStatus(item.order_status?.status?.label || null),
            });
          }
        }
      }
    } catch (err) {
      console.warn("Direct 30-day orders fetch note:", err);
    }

    // 3. Visit NDR page
    console.log("Navigating to NDR page...");
    await page.goto(`${SHOPDECK_BASE}/orders/ndr`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    }).catch((e) => console.warn("NDR page navigation note:", e.message));
    await page.waitForTimeout(2000);

    if (!sessionValid && collectedOrders.size === 0) {
      throw new SessionExpiredError("ShopDeck session returned no valid order data.");
    }

    return Array.from(collectedOrders.values());
  } finally {
    await context.close();
    await browser.close();
  }
}

async function persistOrdersAndDetectFakeAttempts(orders: ScrapedOrder[]) {
  if (orders.length === 0) return;

  // 1. Batch upsert orders
  const ordersPayload = orders.map((o) => ({
    awb_number: o.awbNumber,
    order_id: o.orderId,
    customer_name: o.customerName,
    order_status: o.orderStatus,
    rto_status: o.rtoStatus,
    last_seen_at: new Date().toISOString(),
  }));

  const { error: upsertErr } = await supabase.from("orders").upsert(ordersPayload, {
    onConflict: "awb_number",
  });
  if (upsertErr) console.error("Error batch upserting orders:", upsertErr);

  // 2. Process NDR attempt histories in batch
  const ordersWithAttempts = orders
    .map((o) => ({
      awbNumber: o.awbNumber,
      attemptNumber: o.attemptNumber || extractAttemptNumber(o.orderStatus),
    }))
    .filter((o): o is { awbNumber: string; attemptNumber: number } => o.attemptNumber !== null && !isNaN(o.attemptNumber));

  if (ordersWithAttempts.length > 0) {
    const awbs = Array.from(new Set(ordersWithAttempts.map((o) => o.awbNumber)));
    const { data: existingAttempts } = await supabase
      .from("ndr_attempt_history")
      .select("awb_number, attempt_number")
      .in("awb_number", awbs);

    const existingMap = new Map<string, Set<number>>();
    for (const row of existingAttempts || []) {
      if (!existingMap.has(row.awb_number)) {
        existingMap.set(row.awb_number, new Set());
      }
      existingMap.get(row.awb_number)!.add(row.attempt_number);
    }

    const newAttemptsToInsert: Array<{ awb_number: string; attempt_number: number }> = [];

    for (const item of ordersWithAttempts) {
      const seen = existingMap.get(item.awbNumber) || new Set<number>();
      if (!seen.has(item.attemptNumber)) {
        newAttemptsToInsert.push({
          awb_number: item.awbNumber,
          attempt_number: item.attemptNumber,
        });
        seen.add(item.attemptNumber);

        // Detect fake 3rd attempt
        const isFakeThird = item.attemptNumber === 3 && !seen.has(1) && !seen.has(2);
        if (isFakeThird) {
          await raiseAlert({
            type: "fake_attempt",
            awb_number: item.awbNumber,
            title: `AWB ${item.awbNumber}: 3rd attempt shown with no history`,
            alertBody:
              "ShopDeck shows this as a 3rd delivery attempt, but our records never saw a 1st or 2nd attempt for it. Worth double-checking with the logistics team.",
          });
        }
      }
    }

    if (newAttemptsToInsert.length > 0) {
      const { error: insertErr } = await supabase
        .from("ndr_attempt_history")
        .insert(newAttemptsToInsert);
      if (insertErr) console.error("Error inserting NDR attempts:", insertErr);
    }
  }
}

async function main() {
  try {
    const orders = await scrapeOrdersAndNdr();
    console.log(`Scraped ${orders.length} orders/NDR entries.`);
    await persistOrdersAndDetectFakeAttempts(orders);
    await markScrapeResult("last_scrape_orders_ndr", true);
  } catch (err) {
    console.error("Orders/NDR scrape failed:", err);
    await markScrapeResult("last_scrape_orders_ndr", false);
    await raiseAlert({
      type: "session_expired",
      title: "Orders/NDR scrape failed",
      alertBody:
        err instanceof Error ? err.message : "Unknown error — check the GitHub Actions log.",
    });
    process.exitCode = 1;
  }
}

main();
