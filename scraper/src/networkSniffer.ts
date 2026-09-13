import type { Page } from "playwright";

/**
 * ShopDeck's own frontend calls its internal APIs to load this data (that's
 * how the page renders at all). Those responses are far more stable to
 * parse than the HTML/CSS around them, because backend response shapes
 * change less often than markup during redesigns.
 *
 * This helper doesn't know ShopDeck's real endpoints yet (nobody outside
 * ShopDeck does), so for now it just watches network traffic while the page
 * loads and logs anything that looks promising. Check your GitHub Actions
 * run logs after the first few real runs: if you see a clean JSON endpoint
 * here that already contains AWB/status/attempt data, tell Claude and the
 * relevant scrape*.ts file can be rewritten to parse that response directly
 * instead of the HTML table — much more resilient to ShopDeck UI changes.
 */
export function logCandidateJsonApis(page: Page, urlPattern: RegExp) {
  page.on("response", async (response) => {
    try {
      const url = response.url();
      if (!urlPattern.test(url)) return;
      const contentType = response.headers()["content-type"] || "";
      if (!contentType.includes("application/json")) return;

      const body = await response.json().catch(() => null);
      if (!body) return;

      console.log(`[candidate-api] ${response.status()} ${url}`);
      console.log(`[candidate-api] preview: ${JSON.stringify(body).slice(0, 500)}`);
    } catch {
      // Best-effort logging only — never let this break the actual scrape.
    }
  });
}
