import { chromium, type Browser, type BrowserContext } from "playwright";
import { supabase } from "./supabaseClient.js";

export const SHOPDECK_BASE = "https://pro.shopdeck.com";
const SHOPDECK_DOMAIN = ".shopdeck.com";

/**
 * The Settings page asks the user to paste the FULL "Cookie" request header
 * value from their browser's DevTools (Network tab -> any request to
 * pro.shopdeck.com -> Headers -> "cookie") rather than a single named
 * cookie, because we don't know in advance which cookie name(s) ShopDeck
 * actually uses for the session. This parses that raw header string into
 * individual cookies Playwright can set on the browser context.
 */
function parseCookieHeader(raw: string) {
  return raw
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf("=");
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      return {
        name,
        value,
        domain: SHOPDECK_DOMAIN,
        path: "/",
      };
    });
}

export class SessionExpiredError extends Error {
  constructor() {
    super("ShopDeck session appears to be expired or invalid.");
    this.name = "SessionExpiredError";
  }
}

export async function getShopdeckCookie(): Promise<string> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "shopdeck_cookie")
    .maybeSingle();

  if (error) throw error;
  if (!data?.value) {
    throw new SessionExpiredError();
  }
  return data.value;
}

export async function markScrapeResult(
  key: "last_scrape_orders_ndr" | "last_scrape_tickets_chat",
  ok: boolean
) {
  const now = new Date().toISOString();
  await supabase.from("settings").upsert([
    { key, value: now, updated_at: now },
    { key: "last_scrape_ok", value: String(ok), updated_at: now },
  ]);
}

/**
 * Opens a browser context pre-authenticated with the stored ShopDeck cookie.
 * Caller is responsible for calling context.close() / browser.close().
 */
export async function openAuthenticatedContext(): Promise<{
  browser: Browser;
  context: BrowserContext;
}> {
  const cookieHeader = await getShopdeckCookie();
  const cookies = parseCookieHeader(cookieHeader);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  });
  await context.addCookies(cookies);

  return { browser, context };
}

/**
 * Call this right after navigating to a ShopDeck page. Most dashboards
 * redirect to a /login (or similar) URL when the session is invalid — adjust
 * the substring check below once you've seen ShopDeck's real login URL.
 */
export function assertNotLoggedOut(currentUrl: string) {
  // ADJUST: confirm the exact login path ShopDeck redirects to and refine
  // this check (e.g. it might be "/login", "/auth", "/signin", etc.)
  if (/login|signin|auth/i.test(currentUrl) && !currentUrl.includes(SHOPDECK_BASE + "/orders")) {
    throw new SessionExpiredError();
  }
}
