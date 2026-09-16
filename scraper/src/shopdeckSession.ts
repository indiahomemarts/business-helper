import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { supabase } from "./supabaseClient.js";

export const SHOPDECK_BASE = "https://pro.shopdeck.com";
const SHOPDECK_DOMAIN = ".shopdeck.com";

export const SHOPDECK_HEADERS = {
  "wm_lang": "en",
  "wm_web_version": "7.4",
  "wm_platform": "dashboard",
};

/**
 * Parses raw Cookie header string into individual cookies Playwright can set on the browser context.
 */
export function parseCookieHeader(raw: string) {
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
  constructor(message = "ShopDeck session appears to be expired or invalid.") {
    super(message);
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
    throw new SessionExpiredError("No ShopDeck cookie configured in settings.");
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
 * Opens a browser context pre-authenticated with the stored ShopDeck cookie and custom headers.
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
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: SHOPDECK_HEADERS,
  });
  await context.addCookies(cookies);

  return { browser, context };
}

/**
 * Validates the page is logged in and not redirected to a login/auth page.
 */
export function assertNotLoggedOut(currentUrl: string) {
  if (/\/login|\/signin|\/auth/i.test(currentUrl) && !currentUrl.includes("/orders")) {
    throw new SessionExpiredError(`Redirected to login: ${currentUrl}`);
  }
}
