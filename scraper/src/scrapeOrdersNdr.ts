/**
 * Scrapes /orders/track-orders/all-orders, upserts order rows, and records
 * NDR attempt history so the "fake 3rd attempt" alert can fire.
 *
 * SELECTORS BELOW ARE BEST-EFFORT PLACEHOLDERS. They were written without
 * access to your logged-in ShopDeck account, so they will very likely need
 * adjusting after your first real run. Search this file for "ADJUST" for
 * every spot that needs a look. The easiest way to fix them:
 *   1. Log into ShopDeck in Chrome, open the all-orders page.
 *   2. Right-click a row -> Inspect, and note the actual tag/class structure.
 *   3. Update the selectors below to match, or share the HTML with Claude.
 */
import { openAuthenticatedContext, assertNotLoggedOut, markScrapeResult, SHOPDECK_BASE } from "./shopdeckSession.js";
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
}

function extractAttemptNumber(statusText: string | null): number | null {
  if (!statusText) return null;
  // ADJUST: matches things like "NDR - 3rd Attempt", "Attempt 2", "2nd attempt".
  const match = statusText.match(/attempt\s*[:#]?\s*(\d)/i) || statusText.match(/(\d)(?:st|nd|rd|th)\s*attempt/i);
  return match ? parseInt(match[1], 10) : null;
}

async function scrapeOrdersPage(): Promise<ScrapedOrder[]> {
  const { browser, context } = await openAuthenticatedContext();
  const page = await context.newPage();

  // Logs any JSON API calls ShopDeck's own frontend makes while this page
  // loads — check your Action run logs to find a better data source later.
  logCandidateJsonApis(page, /order|track|ndr/i);

  try {
    await page.goto(`${SHOPDECK_BASE}/orders/track-orders/all-orders`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    assertNotLoggedOut(page.url());

    // ADJUST: wait for whatever element actually indicates the table has
    // loaded. "table tbody tr" is a generic guess.
    await page.waitForSelector("table tbody tr", { timeout: 15_000 }).catch(() => {
      throw new Error("Orders table never appeared — page structure may differ from expectations.");
    });

    const rows = await page.$$("table tbody tr");
    const orders: ScrapedOrder[] = [];

    for (const row of rows) {
      // ADJUST: these cell selectors assume a plain <td> table. Replace with
      // whatever actually holds each value (could be nested divs/spans).
      const cells = await row.$$("td");
      const cellTexts = await Promise.all(cells.map((c) => c.innerText()));

      // ADJUST: this column-index guess is almost certainly wrong for your
      // real table. A more resilient alternative: read the table's <thead>
      // once, match column names ("AWB", "Order ID", "Status", ...) by text,
      // and look up cellTexts by that resolved index instead of a fixed one.
      const [orderId, awbNumber, customerName, orderStatus, rtoStatus] = cellTexts;

      if (!awbNumber?.trim()) continue;

      orders.push({
        awbNumber: awbNumber.trim(),
        orderId: orderId?.trim() || null,
        customerName: customerName?.trim() || null,
        orderStatus: orderStatus?.trim() || null,
        rtoStatus: rtoStatus?.trim() || null,
      });
    }

    return orders;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function persistOrdersAndDetectFakeAttempts(orders: ScrapedOrder[]) {
  for (const o of orders) {
    await supabase.from("orders").upsert({
      awb_number: o.awbNumber,
      order_id: o.orderId,
      customer_name: o.customerName,
      order_status: o.orderStatus,
      rto_status: normalizeRtoStatus(o.rtoStatus || o.orderStatus),
      last_seen_at: new Date().toISOString(),
    });

    const attemptNumber = extractAttemptNumber(o.orderStatus);
    if (attemptNumber === null) continue;

    const { data: existingAttempts } = await supabase
      .from("ndr_attempt_history")
      .select("attempt_number")
      .eq("awb_number", o.awbNumber);

    const seenNumbers = new Set((existingAttempts || []).map((r) => r.attempt_number));
    if (seenNumbers.has(attemptNumber)) continue; // already recorded, nothing new

    await supabase.from("ndr_attempt_history").insert({
      awb_number: o.awbNumber,
      attempt_number: attemptNumber,
    });

    const isFakeThirdAttempt = attemptNumber === 3 && !seenNumbers.has(1) && !seenNumbers.has(2);
    if (isFakeThirdAttempt) {
      await raiseAlert({
        type: "fake_attempt",
        awb_number: o.awbNumber,
        title: `AWB ${o.awbNumber}: 3rd attempt shown with no history`,
        alertBody:
          "ShopDeck shows this as a 3rd delivery attempt, but our records never saw a 1st or 2nd attempt for it. Worth double-checking with the logistics team.",
      });
    }
  }
}

async function main() {
  try {
    const orders = await scrapeOrdersPage();
    console.log(`Scraped ${orders.length} orders.`);
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
