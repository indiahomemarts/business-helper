/**
 * Scrapes /orders/rto/intransit and updates rto_status on the matching
 * orders. See scrapeOrdersNdr.ts for the "SELECTORS ARE PLACEHOLDERS" note —
 * the same caveat applies here. Search for "ADJUST".
 */
import { openAuthenticatedContext, assertNotLoggedOut, SHOPDECK_BASE } from "./shopdeckSession.js";
import { logCandidateJsonApis } from "./networkSniffer.js";
import { raiseAlert } from "./apiClient.js";
import { supabase } from "./supabaseClient.js";
import { normalizeRtoStatus } from "./statusNormalizer.js";

interface ScrapedRtoRow {
  awbNumber: string;
  rawStatus: string | null;
}

async function scrapeRtoPage(): Promise<ScrapedRtoRow[]> {
  const { browser, context } = await openAuthenticatedContext();
  const page = await context.newPage();
  logCandidateJsonApis(page, /rto|return/i);

  try {
    await page.goto(`${SHOPDECK_BASE}/orders/rto/intransit`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    assertNotLoggedOut(page.url());

    await page.waitForSelector("table tbody tr", { timeout: 15_000 }).catch(() => {
      throw new Error("RTO table never appeared — page structure may differ from expectations.");
    });

    const rows = await page.$$("table tbody tr");
    const results: ScrapedRtoRow[] = [];

    for (const row of rows) {
      const cells = await row.$$("td");
      const cellTexts = await Promise.all(cells.map((c) => c.innerText()));
      // ADJUST: column-index guess, same caveat as the orders scraper.
      const [awbNumber, , , rawStatus] = cellTexts;
      if (!awbNumber?.trim()) continue;
      results.push({ awbNumber: awbNumber.trim(), rawStatus: rawStatus?.trim() || null });
    }

    return results;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  try {
    const rows = await scrapeRtoPage();
    console.log(`Scraped ${rows.length} RTO rows.`);

    for (const r of rows) {
      // upsert with onConflict so we don't clobber other order fields if the
      // order already exists from the orders/NDR scrape
      await supabase.from("orders").upsert(
        {
          awb_number: r.awbNumber,
          rto_status: normalizeRtoStatus(r.rawStatus),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "awb_number", ignoreDuplicates: false }
      );
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
