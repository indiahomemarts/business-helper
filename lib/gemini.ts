import "server-only";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

/**
 * Low-level call to Gemini asking for a JSON object back. We ask the model to
 * respond with ONLY JSON (no markdown fences, no preamble) and then parse it,
 * stripping fences defensively in case the model adds them anyway.
 */
async function callGeminiJson<T>(systemInstruction: string, userPrompt: string): Promise<T> {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your environment variables (see .env.example)."
    );
  }

  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(ENDPOINT(GEMINI_MODEL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini API returned no content. Raw response: " + JSON.stringify(data));
  }

  const cleaned = text.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned) as T;
}

const BUSINESS_PARTNER_PERSONA = `
You are acting as the seller's business partner, not a generic customer-support
bot. You help a small D2C chocolate seller on the ShopDeck platform deal with
their support agents. Prioritize the seller's business security, evidence,
and cost -- e.g. never suggest agreeing to something that waives the seller's
right to compensation without saying so explicitly, and flag anything that
looks like it needs the seller's own judgment rather than a quick reply.
Keep language simple and direct. When asked for a Gujarati summary, write in
plain, everyday Gujarati (not overly formal/literary), as a business partner
would explain it out loud to the seller.
`.trim();

export interface SummaryResult {
  summary_gujarati: string;
  conclusion_gujarati: string;
  reply_suggestions: string[];
}

/**
 * Summarize the latest agent message (in the context of the thread so far)
 * into a short Gujarati summary + conclusion, and propose 2-3 reply drafts.
 */
export async function summarizeAndSuggestReplies(
  rollingSummary: string | null,
  recentMessages: { sender: string; message: string }[]
): Promise<SummaryResult> {
  const thread = recentMessages.map((m) => `${m.sender}: ${m.message}`).join("\n");

  const prompt = `
Context so far (rolling summary of the thread, may be empty if this is new):
${rollingSummary || "(no prior summary — this is a new thread)"}

Most recent messages:
${thread}

Respond with ONLY a JSON object in this exact shape, nothing else:
{
  "summary_gujarati": "2-3 sentence plain Gujarati summary of what the agent is saying",
  "conclusion_gujarati": "one short sentence: what does this actually mean for the seller / what do they need to do",
  "reply_suggestions": ["short professional reply option 1", "short professional reply option 2", "short professional reply option 3"]
}
`.trim();

  return callGeminiJson<SummaryResult>(BUSINESS_PARTNER_PERSONA, prompt);
}

export interface ResolutionResult {
  flag: "resolved" | "needs_review";
  reasoning: string;
}

/**
 * Called when a ticket transitions to closed. Asks whether the conversation
 * shows a genuine resolution or looks like it was closed without one.
 *
 * IMPORTANT: this is a triage aid, not a certainty machine. Treat "resolved"
 * as "looks fine, low priority to double check" and "needs_review" as
 * "flag for the seller to read personally" -- never suppress the underlying
 * ticket data based on this flag alone.
 */
export async function evaluateResolution(
  fullThreadText: string
): Promise<ResolutionResult> {
  const prompt = `
Here is the full text of a ShopDeck support ticket that has just been closed:

${fullThreadText}

Did the agent actually provide a concrete resolution (a fix, a compensation,
a clear answer to the seller's question) before the ticket closed? Or was it
closed without a real resolution (e.g. auto-closed after 2 days, vague
non-answer, agent stopped responding)?

Respond with ONLY a JSON object in this exact shape, nothing else:
{
  "flag": "resolved" or "needs_review",
  "reasoning": "one short sentence explaining why, in plain English"
}
`.trim();

  return callGeminiJson<ResolutionResult>(BUSINESS_PARTNER_PERSONA, prompt);
}

/**
 * Rolls new messages into the existing summary so we never have to replay
 * the full raw history on every call. Call this after fetching new messages
 * for a ticket, before calling summarizeAndSuggestReplies for the next one.
 */
export async function updateRollingSummary(
  previousSummary: string | null,
  newMessages: { sender: string; message: string }[]
): Promise<string> {
  if (newMessages.length === 0) return previousSummary || "";

  const prompt = `
Previous summary of this support thread (may be empty):
${previousSummary || "(none yet)"}

New messages to fold in:
${newMessages.map((m) => `${m.sender}: ${m.message}`).join("\n")}

Write an updated summary of the WHOLE thread so far, in plain English,
in no more than 5 sentences. Keep concrete facts (order numbers, amounts,
promises made) and drop small talk. Respond with ONLY a JSON object:
{ "summary": "..." }
`.trim();

  const result = await callGeminiJson<{ summary: string }>(
    BUSINESS_PARTNER_PERSONA,
    prompt
  );
  return result.summary;
}
