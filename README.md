# ShopDeck Ops Assistant

An internal, single-user web app + PWA for tracking NDR calls, RTO parcels,
and ShopDeck support tickets, with an AI assistant for chat summarization
and reply suggestions. Built to run at close to $0/month.

## How it's put together

```
┌─────────────────────┐        ┌──────────────────────────┐
│  GitHub Actions      │  every │  Supabase (Postgres +    │
│  Playwright scraper   │ 5-15   │  Storage)                │
│  (reads ShopDeck)     │─min───▶│  — single source of      │
│  public repo, free    │        │    truth for all data    │
└──────────┬────────────┘        └───────────▲──────────────┘
           │ calls (Bearer token)             │ reads/writes
           ▼                                  │
┌─────────────────────────────────────────────┴──────────────┐
│  Vercel — Next.js app (Hobby/free tier)                     │
│  Dashboard UI, NDR/RTO/Tickets pages, AI calls (Gemini),     │
│  Web Push notifications, PWA (installable from Chrome)       │
└───────────────────────────────────────────────────────────┘
```

Why split it this way: Vercel's free tier can't run cron more than once a
day, and can't comfortably run a full headless browser inside a serverless
function. GitHub Actions has no such limit as long as the repo is **public**
(private repos get only 2,000 free minutes/month, which isn't enough for a
5-minute schedule). Your ShopDeck login itself is never in the code — it
lives only in Supabase, pasted through the app's Settings page.

## Before you start — accounts to create (all free)

1. **GitHub** — github.com — to host the code and run the scraper on a schedule
2. **Vercel** — vercel.com — to host the dashboard (sign up with GitHub, it's one click)
3. **Supabase** — supabase.com — the database
4. **Google AI Studio** — aistudio.google.com/apikey — a free Gemini API key

---

## Step 1 — Supabase

1. Create a new project at supabase.com (pick any region close to India, e.g. Singapore).
2. Once it's ready, go to **SQL Editor → New query**, paste the entire contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and click **Run**.
3. Go to **Project Settings → API**. Copy:
   - **Project URL** → this is `SUPABASE_URL`
   - **service_role key** (not the `anon` key) → this is `SUPABASE_SERVICE_ROLE_KEY`

Keep this tab open — you'll need both values twice (once for Vercel, once for GitHub).

## Step 2 — Generate your secret keys

You need four random values. Easiest way: run these on your own computer
(with Node installed) or in any online UUID/random-string generator:

```bash
# Push notification keys (do this from inside the project folder)
npm install
npm run generate-vapid
# prints NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY — save both

# Any long random string works for these two — e.g.:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# run it twice: once for INTERNAL_API_SECRET, once for APP_SESSION_SECRET
```

Also pick your own **APP_PASSWORD** — this is the password you'll personally
type to open the app (see "Security" below for why this exists).

## Step 3 — Gemini API key

Go to aistudio.google.com/apikey, click **Create API key**, copy it. This is
`GEMINI_API_KEY`. The free tier is more than enough for one seller's chat volume.

## Step 4 — Push the code to GitHub

Create a **public** repository (Settings → General → this must be public for
free unlimited Actions minutes — your ShopDeck login is never in the code,
only in encrypted GitHub Secrets, so this is safe).

```bash
cd shopdeck-assistant
git remote add origin https://github.com/YOUR_USERNAME/shopdeck-assistant.git
git branch -M main
git push -u origin main
```

## Step 5 — Deploy to Vercel

1. vercel.com → **Add New → Project** → import the GitHub repo you just created.
2. Before deploying, open **Environment Variables** and add all of these:

   | Key | Value |
   |---|---|
   | `SUPABASE_URL` | from Step 1 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from Step 1 |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | from Step 2 |
   | `VAPID_PRIVATE_KEY` | from Step 2 |
   | `VAPID_SUBJECT` | `mailto:` + your email |
   | `GEMINI_API_KEY` | from Step 3 |
   | `GEMINI_MODEL` | `gemini-2.5-flash-lite` |
   | `INTERNAL_API_SECRET` | from Step 2 |
   | `APP_PASSWORD` | your chosen password |
   | `APP_SESSION_SECRET` | from Step 2 |

3. Click **Deploy**. Once it's live, copy your Vercel URL (e.g.
   `https://shopdeck-assistant.vercel.app`) — you'll need it in the next step.

## Step 6 — GitHub Actions secrets

In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**. Add:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | same as Step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | same as Step 1 |
| `INTERNAL_API_SECRET` | same as Step 2 |
| `APP_URL` | your Vercel URL from Step 5, **no trailing slash** |

The three workflows in `.github/workflows/` will now run automatically on
their schedules. You can also trigger any of them manually from the
**Actions** tab (click the workflow → **Run workflow**) to test immediately
instead of waiting.

## Step 7 — First login

Open your Vercel URL. Enter the `APP_PASSWORD` you chose. You're in.

On Android Chrome: tap the **⋮** menu → **Add to Home screen** — this
installs it as a proper app icon. Open it from the home screen once, go to
**Settings**, and tap **Turn on notifications**.

## Step 8 — Connect your ShopDeck account

1. In Chrome, log into `pro.shopdeck.com` normally.
2. Open DevTools (F12 or ⋮ → More tools → Developer tools) → **Network** tab.
3. Reload the ShopDeck page. Click any request in the list going to `pro.shopdeck.com`.
4. In the **Headers** panel, find the request header called **cookie** and copy its entire value (it'll be a long string like `foo=abc; bar=xyz; ...`).
5. In the ShopDeck Ops Assistant app → **Settings**, paste that whole string into the ShopDeck session box and tap **Save cookie**.

That cookie will expire eventually (exact lifetime depends on ShopDeck — could
be hours or weeks). When the dashboard shows "Scraper couldn't reach
ShopDeck," just repeat these 5 steps.

## Step 9 — Watch the first real run and fix the selectors

This is the one part that couldn't be finished without your live ShopDeck
account. The scraper scripts in `scraper/src/` were written with best-effort
placeholder selectors, clearly marked with `// ADJUST` comments.

1. In GitHub → **Actions** tab, manually run "Scrape orders, NDR & RTO" and
   "Scrape tickets & chat" (the **Run workflow** button).
2. Click into the run → open the job → read the log output.
   - If it worked, you'll see `Scraped N orders.` with a real number.
   - If it failed, the error message will say what broke (table never
     appeared, session expired, etc).
   - Either way, look for lines starting with `[candidate-api]` — these are
     JSON API calls ShopDeck's own page made while loading. If one of them
     clearly contains order/ticket data, that's a much better data source
     than parsing HTML — share that log output and the relevant
     `scrape*.ts` file can be rewritten to use it directly.
3. If the table-scraping approach mostly works but pulls the wrong columns,
   share a screenshot of the real page (or right-click a row → Inspect →
   copy the HTML) and the column mapping in the relevant script can be
   corrected in a couple of lines.

This is expected to take one or two rounds of "run it, see what broke, fix
it" — that's the honest tradeoff of there being no official ShopDeck API.

---

## Cost recap

| Item | Cost |
|---|---|
| Vercel (Hobby) | $0 |
| Supabase (Free tier) | $0 to start; expect to need Pro (~$25/mo) once audio recordings or order history grow — see the PRD doc for the Cloudflare R2 workaround if you want to delay this |
| GitHub Actions (public repo) | $0, no minute limit |
| Gemini API | $0 at this volume (free tier) |
| Web Push | $0 (no third-party service used) |
| **Total** | **~$0/month to start** |

## Security — read this

This app has **no full user-account system**, by design, to keep things
simple and cheap. What it does have:

- A single shared password (Section "First login") gates the entire app
  behind a session cookie, so it isn't nakedly open on the internet.
- The Supabase service role key (which can read/write everything) is only
  ever used server-side — never sent to the browser.
- Internal routes the scraper calls (`/api/cron/*`) require a separate
  bearer-token secret, so even someone who found your Vercel URL couldn't
  trigger them.

What it does **not** have: multiple user accounts, rate limiting, or
protection against someone who both knows your password and is actively
trying to abuse the app. That's an acceptable tradeoff for a single-person
internal tool — just don't share the password, and rotate `APP_PASSWORD` if
you ever suspect it leaked.

## What's genuinely done vs. what needs your input

**Solid and complete:** database schema, all dashboard pages, NDR call
logging with audio evidence, RTO physical-inward flow with OTP-over-push
confirmation, the fake-attempt detection logic, the missing-parcel
reconciliation logic, AI summarization with cost-efficient rolling memory,
push notifications end-to-end, the login gate.

**Will need a short back-and-forth after your first deploy:** the exact
CSS selectors in `scraper/src/scrape*.ts` (Step 9 above) — this was always
going to be true for any scraper built without access to your live account,
regardless of who builds it.
