/**
 * Scrapes ticket status from /seller-support/tickets-new and messages from
 * /seller-chat. Same placeholder-selector caveat as the other scrapers —
 * search for "ADJUST". This one also makes an assumption worth checking on
 * your first real run: that each chat thread on /seller-chat is identified
 * by (or links to) the same ticket_id shown on the tickets page. If
 * ShopDeck's chat is structured differently (e.g. chats aren't 1:1 with
 * tickets), this will need rethinking together once you can see the real
 * page.
 */
import { openAuthenticatedContext, assertNotLoggedOut, markScrapeResult, SHOPDECK_BASE } from "./shopdeckSession.js";
import { logCandidateJsonApis } from "./networkSniffer.js";
import { raiseAlert, evaluateResolution } from "./apiClient.js";
import { supabase } from "./supabaseClient.js";

interface ScrapedTicket {
  ticketId: string;
  subject: string | null;
  status: "open" | "closed";
}

interface ScrapedMessage {
  ticketId: string;
  sender: "agent" | "seller";
  message: string;
}

async function scrapeTickets(): Promise<ScrapedTicket[]> {
  const { browser, context } = await openAuthenticatedContext();
  const page = await context.newPage();
  logCandidateJsonApis(page, /ticket|support/i);

  try {
    await page.goto(`${SHOPDECK_BASE}/seller-support/tickets-new`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    assertNotLoggedOut(page.url());

    await page.waitForSelector("table tbody tr, [class*='ticket-row']", { timeout: 15_000 }).catch(() => {
      throw new Error("Ticket list never appeared — page structure may differ from expectations.");
    });

    // ADJUST: this assumes a table; ShopDeck may instead render a list of
    // cards. If so, replace this whole block with page.$$('[class*="ticket-row"]')
    // and adjust the per-row extraction below to match.
    const rows = await page.$$("table tbody tr");
    const tickets: ScrapedTicket[] = [];

    for (const row of rows) {
      const cells = await row.$$("td");
      const cellTexts = await Promise.all(cells.map((c) => c.innerText()));
      // ADJUST: column-index guess.
      const [ticketId, subject, statusText] = cellTexts;
      if (!ticketId?.trim()) continue;

      tickets.push({
        ticketId: ticketId.trim(),
        subject: subject?.trim() || null,
        status: /closed/i.test(statusText || "") ? "closed" : "open",
      });
    }

    return tickets;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function scrapeChatMessages(ticketIds: string[]): Promise<ScrapedMessage[]> {
  const { browser, context } = await openAuthenticatedContext();
  const page = await context.newPage();
  logCandidateJsonApis(page, /chat|message/i);
  const allMessages: ScrapedMessage[] = [];

  try {
    await page.goto(`${SHOPDECK_BASE}/seller-chat`, { waitUntil: "networkidle", timeout: 45_000 });
    assertNotLoggedOut(page.url());

    // ADJUST: entirely best-effort. This assumes clicking a thread whose
    // visible text contains the ticket ID opens that conversation, and that
    // messages render as elements with a "sent by me" vs "sent by them"
    // visual distinction we can key off of (commonly a CSS class or
    // alignment). Replace with real selectors once you can see the DOM.
    for (const ticketId of ticketIds) {
      const threadLink = page.getByText(ticketId, { exact: false }).first();
      const count = await threadLink.count();
      if (count === 0) continue;

      await threadLink.click();
      await page.waitForTimeout(1000);

      const messageEls = await page.$$("[class*='message'], [class*='chat-bubble']");
      for (const el of messageEls) {
        const text = (await el.innerText()).trim();
        if (!text) continue;
        // ADJUST: guessing "agent"/"seller" from a class name. Replace with
        // whatever ShopDeck actually uses to distinguish sender.
        const className = (await el.getAttribute("class")) || "";
        const sender: ScrapedMessage["sender"] = /agent|support|admin/i.test(className)
          ? "agent"
          : "seller";
        allMessages.push({ ticketId, sender, message: text });
      }
    }

    return allMessages;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function persistTicketsAndDetectTransitions(scraped: ScrapedTicket[]) {
  const { data: existing } = await supabase.from("tickets").select("ticket_id, status");
  const previousStatus = new Map((existing || []).map((t) => [t.ticket_id, t.status]));

  for (const t of scraped) {
    const wasOpen = previousStatus.get(t.ticketId) === "open";
    const justClosed = wasOpen && t.status === "closed";

    await supabase.from("tickets").upsert({
      ticket_id: t.ticketId,
      subject: t.subject,
      status: t.status,
      closed_at: t.status === "closed" ? new Date().toISOString() : null,
      last_synced_at: new Date().toISOString(),
    });

    if (justClosed) {
      // Ask the main app to run the AI resolution check + raise the right alert.
      await evaluateResolution(t.ticketId);
    }
  }
}

async function persistNewMessagesAndAlert(messages: ScrapedMessage[]) {
  for (const m of messages) {
    // Avoid inserting the same message twice on repeated 5-minute runs.
    const { data: dup } = await supabase
      .from("chat_history")
      .select("id")
      .eq("ticket_id", m.ticketId)
      .eq("sender", m.sender)
      .eq("message", m.message)
      .limit(1);

    if (dup && dup.length > 0) continue;

    await supabase.from("chat_history").insert({
      ticket_id: m.ticketId,
      sender: m.sender,
      message: m.message,
    });

    if (m.sender === "agent") {
      await raiseAlert({
        type: "new_agent_message",
        ticket_id: m.ticketId,
        title: `New message on ticket #${m.ticketId}`,
        alertBody: m.message.slice(0, 140),
      });
    }
  }
}

async function main() {
  try {
    const tickets = await scrapeTickets();
    console.log(`Scraped ${tickets.length} tickets.`);
    await persistTicketsAndDetectTransitions(tickets);

    const messages = await scrapeChatMessages(tickets.map((t) => t.ticketId));
    console.log(`Scraped ${messages.length} chat messages.`);
    await persistNewMessagesAndAlert(messages);

    await markScrapeResult("last_scrape_tickets_chat", true);
  } catch (err) {
    console.error("Tickets/chat scrape failed:", err);
    await markScrapeResult("last_scrape_tickets_chat", false);
    await raiseAlert({
      type: "session_expired",
      title: "Tickets/chat scrape failed",
      alertBody: err instanceof Error ? err.message : "Unknown error — check the GitHub Actions log.",
    });
    process.exitCode = 1;
  }
}

main();
