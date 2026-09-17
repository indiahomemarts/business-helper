/**
 * Scrapes ticket status from /seller-support/tickets-new and messages from /seller-chat
 * via real API interception and browsing, persists them in Supabase in batch,
 * and triggers AI resolution evaluation & new message alerts.
 */
import {
  openAuthenticatedContext,
  assertNotLoggedOut,
  markScrapeResult,
  SHOPDECK_BASE,
  SessionExpiredError,
} from "./shopdeckSession.js";
import { logCandidateJsonApis } from "./networkSniffer.js";
import { raiseAlert, evaluateResolution } from "./apiClient.js";
import { supabase } from "./supabaseClient.js";

interface ScrapedTicket {
  ticketId: string;
  subject: string | null;
  status: "open" | "closed";
  openedAt?: string | null;
  closedAt?: string | null;
}

interface ScrapedMessage {
  ticketId: string;
  sender: "agent" | "seller";
  message: string;
  sentAt?: string | null;
}

function parseDateStr(str: string | null | undefined): string | null {
  if (!str) return null;
  try {
    const cleaned = str.replace("•", "").trim();
    const parsed = new Date(cleaned);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  } catch {
    return null;
  }
}

async function scrapeTicketsAndChat(): Promise<{
  tickets: ScrapedTicket[];
  messages: ScrapedMessage[];
}> {
  const { browser, context } = await openAuthenticatedContext();
  const page = await context.newPage();
  logCandidateJsonApis(page, /ticket|support|chat|message/i);

  const collectedTickets: Map<string, ScrapedTicket> = new Map();
  const collectedMessages: ScrapedMessage[] = [];
  let sessionValid = false;

  page.on("response", async (res) => {
    const url = res.url();
    const status = res.status();

    if (status === 200) {
      sessionValid = true;

      // 1. Handle Tickets API response
      if (url.includes("/customer-support-ticket/sales-force-tickets")) {
        try {
          const json = await res.json();
          const items = json?.data?.tickets || [];
          for (const t of items) {
            const id = String(t.ticket_id || t.internal_ticket_id || "").trim();
            if (!id) continue;

            const isClosed =
              Boolean(t.is_ticket_closed) ||
              /completed|closed/i.test(t.status?.label || "");

            collectedTickets.set(id, {
              ticketId: id,
              subject: t.title || t.issue || null,
              status: isClosed ? "closed" : "open",
              openedAt: parseDateStr(t.date),
              closedAt: isClosed ? parseDateStr(t.ticket_closed_at) || new Date().toISOString() : null,
            });
          }
        } catch (e) {
          console.error("Error parsing tickets response:", e);
        }
      }

      // 2. Handle Chat Messages API response
      if (url.includes("/seller-chats/chat/messages")) {
        try {
          const json = await res.json();
          const events = json?.chat_events || [];
          for (const ev of events) {
            if (ev.event_type !== "message") continue;

            let content = (ev.content || "").trim();
            const sender: ScrapedMessage["sender"] =
              ev.sender_type === "seller" ? "seller" : "agent";
            const sentAt = ev.timestamp ? new Date(ev.timestamp).toISOString() : new Date().toISOString();

            // Check if ticket number is embedded in message or context
            let ticketId = ev.context?.ticket?.number || "";
            if (!ticketId) {
              const ticketMatch = content.match(/#?(\d{6})/);
              if (ticketMatch) {
                ticketId = ticketMatch[1];
              }
            }

            if (!content && ev.context?.ticket?.title) {
              content = `${ev.context.ticket.title} (Ticket #${ev.context.ticket.number})`;
            }

            if (content) {
              collectedMessages.push({
                ticketId: ticketId || "general",
                sender,
                message: content,
                sentAt,
              });
            }
          }
        } catch (e) {
          console.error("Error parsing chat response:", e);
        }
      }
    }
  });

  try {
    // 1. Visit Tickets page
    console.log("Navigating to tickets page...");
    await page.goto(`${SHOPDECK_BASE}/seller-support/tickets-new`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    assertNotLoggedOut(page.url());
    await page.waitForTimeout(2000);

    // 2. Visit Seller Chat page
    console.log("Navigating to seller chat page...");
    await page.goto(`${SHOPDECK_BASE}/seller-chat`, {
      waitUntil: "networkidle",
      timeout: 45_000,
    }).catch((e) => console.warn("Chat page navigation note:", e.message));
    await page.waitForTimeout(2000);

    // Fallback: If chat messages had "general" ticketId, map them to known tickets
    const knownTicketIds = Array.from(collectedTickets.keys());
    const latestTicketId = knownTicketIds[0] || null;

    for (const m of collectedMessages) {
      if (m.ticketId === "general" && latestTicketId) {
        m.ticketId = latestTicketId;
      }
    }

    if (!sessionValid && collectedTickets.size === 0) {
      throw new SessionExpiredError("ShopDeck session returned no valid ticket data.");
    }

    return {
      tickets: Array.from(collectedTickets.values()),
      messages: collectedMessages,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function persistTicketsAndDetectTransitions(scraped: ScrapedTicket[], messages: ScrapedMessage[]) {
  if (scraped.length === 0) return;

  const { data: existing } = await supabase.from("tickets").select("ticket_id, status, is_closed_by_shopdeck");
  const previousStatus = new Map((existing || []).map((t) => [t.ticket_id, t.status]));
  const previousClosed = new Map((existing || []).map((t) => [t.ticket_id, t.is_closed_by_shopdeck]));

  // Check which tickets have messages
  const ticketsWithMessages = new Set(messages.map((m) => m.ticketId));

  const payload = scraped.map((t) => {
    const isClosed = t.status === "closed";
    const hasChat = ticketsWithMessages.has(t.ticketId);

    return {
      ticket_id: t.ticketId,
      subject: t.subject,
      status: t.status,
      opened_at: t.openedAt || undefined,
      closed_at: t.closedAt,
      is_closed_by_shopdeck: isClosed,
      shopdeck_closed_at: isClosed ? t.closedAt || new Date().toISOString() : null,
      has_chat_messages: hasChat,
      last_synced_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase.from("tickets").upsert(payload, {
    onConflict: "ticket_id",
  });
  if (error) console.error("Error batch upserting tickets:", error);

  for (const t of scraped) {
    const wasOpen = previousStatus.get(t.ticketId) === "open";
    const wasAlreadyClosed = previousClosed.get(t.ticketId) === true;
    const justClosed = (wasOpen && t.status === "closed") || (!wasAlreadyClosed && t.status === "closed");

    if (justClosed) {
      // Check if there are messages for this ticket in DB or in scraped batch
      const { data: chatRows } = await supabase
        .from("chat_history")
        .select("id")
        .eq("ticket_id", t.ticketId)
        .limit(1);

      const hasChat = (chatRows && chatRows.length > 0) || ticketsWithMessages.has(t.ticketId);

      // Raise notification for ticket closed by ShopDeck
      await raiseAlert({
        type: "ticket_resolved",
        ticket_id: t.ticketId,
        title: `ShopDeck closed Ticket #${t.ticketId}`,
        alertBody: hasChat
          ? `Ticket #${t.ticketId} (${t.subject || "No Subject"}) was closed by ShopDeck. Please review and mark as solved if satisfied.`
          : `⚠️ WARNING: Ticket #${t.ticketId} was closed by ShopDeck WITHOUT ANY CHAT DISCUSSION from the team.`,
      });

      // Trigger AI resolution check
      await evaluateResolution(t.ticketId);
    }
  }
}

async function persistNewMessagesAndAlert(messages: ScrapedMessage[]) {
  const valid = messages.filter((m) => m.ticketId && m.ticketId !== "general");
  if (valid.length === 0) return;

  const ticketIds = Array.from(new Set(valid.map((m) => m.ticketId)));
  const { data: existing } = await supabase
    .from("chat_history")
    .select("ticket_id, sender, message")
    .in("ticket_id", ticketIds);

  const existingSet = new Set((existing || []).map((m) => `${m.ticket_id}|${m.sender}|${m.message}`));
  const toInsert = valid.filter((m) => !existingSet.has(`${m.ticketId}|${m.sender}|${m.message}`));

  if (toInsert.length > 0) {
    const { error } = await supabase.from("chat_history").insert(
      toInsert.map((m) => ({
        ticket_id: m.ticketId,
        sender: m.sender,
        message: m.message,
        sent_at: m.sentAt || new Date().toISOString(),
      }))
    );
    if (error) console.error("Error inserting chat history:", error);

    // Update tickets table to note that this ticket has messages
    const newlyActiveTicketIds = Array.from(new Set(toInsert.map((m) => m.ticketId)));
    await supabase
      .from("tickets")
      .update({ has_chat_messages: true })
      .in("ticket_id", newlyActiveTicketIds);

    // Note: per-message push notification alert is suppressed as requested ("no need to notify me on every new messages")
  }
}

async function main() {
  try {
    const { tickets, messages } = await scrapeTicketsAndChat();
    console.log(`Scraped ${tickets.length} tickets and ${messages.length} messages.`);

    await persistTicketsAndDetectTransitions(tickets, messages);
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
