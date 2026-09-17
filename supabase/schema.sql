-- ShopDeck Automation & AI Assistant — Database Schema
-- Run this once in Supabase: Project -> SQL Editor -> New query -> paste -> Run.
--
-- Design note: every table here is only ever read/written by the Next.js API
-- routes (using the service role key) or the GitHub Actions scraper (also
-- service role key). Nothing talks to Supabase directly from the browser, so
-- Row Level Security is enabled with NO permissive policies — the service
-- role key bypasses RLS by design, and this keeps the tables unreachable if
-- a key were ever leaked into client-side code by mistake.

-- ============================================================
-- SETTINGS — single-row key/value store (ShopDeck cookie, etc.)
-- ============================================================
create table if not exists settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- Seed the keys the app expects so the Settings page can always find a row to update.
insert into settings (key, value) values
  ('shopdeck_cookie', null),
  ('shopdeck_cookie_updated_at', null),
  ('last_scrape_orders_ndr', null),
  ('last_scrape_tickets_chat', null),
  ('last_scrape_ok', 'true'),
  ('rto_initial_total', '0'),
  ('rto_baseline_date', null)
on conflict (key) do nothing;

-- ============================================================
-- ORDERS
-- ============================================================
create table if not exists orders (
  awb_number text primary key,
  order_id text,
  customer_name text,
  order_status text,           -- raw status text as shown on ShopDeck
  rto_status text,             -- e.g. null, 'RTO_INITIATED', 'RTO_DELIVERED'
  delivered_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ============================================================
-- NDR ATTEMPT HISTORY — every attempt count we've ever observed per AWB.
-- This is what makes "fake 3rd attempt" detection reliable over time.
-- ============================================================
create table if not exists ndr_attempt_history (
  id bigint generated always as identity primary key,
  awb_number text not null references orders(awb_number) on delete cascade,
  attempt_number int not null,
  observed_at timestamptz not null default now(),
  source text not null default 'scraper', -- 'scraper' or 'backfill'
  unique (awb_number, attempt_number)
);

create index if not exists idx_ndr_attempt_history_awb on ndr_attempt_history(awb_number);

-- ============================================================
-- NDR CALL LOGS — one row per calling attempt your team makes
-- ============================================================
create type ndr_call_status as enum (
  'no_answer',
  'call_disconnected',
  'refused_delivery',
  'language_barrier_wrong_number'
);

create table if not exists ndr_logs (
  id bigint generated always as identity primary key,
  awb_number text not null references orders(awb_number) on delete cascade,
  attempt_count_at_call int,
  call_status ndr_call_status not null,
  audio_file_path text,       -- path inside Supabase Storage bucket "ndr-recordings"
  notes text,
  called_at timestamptz not null default now()
);

create index if not exists idx_ndr_logs_awb on ndr_logs(awb_number);
create index if not exists idx_ndr_logs_called_at on ndr_logs(called_at desc);

-- ============================================================
-- RTO PHYSICAL INWARDING — Proof of physical receipt with file upload
-- ============================================================
create table if not exists rto_inward_log (
  id bigint generated always as identity primary key,
  awb_number text not null references orders(awb_number) on delete cascade,
  otp_verified boolean not null default false,
  scanned_at timestamptz not null default now()
);

create unique index if not exists idx_rto_inward_awb on rto_inward_log(awb_number);

-- Detailed inwarding entries including proof files (image/pdf) & time logs
create table if not exists rto_inward_entries (
  id bigint generated always as identity primary key,
  awb_number text not null references orders(awb_number) on delete cascade,
  file_path text,
  file_name text,
  file_type text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_rto_inward_entries_awb on rto_inward_entries(awb_number);
create index if not exists idx_rto_inward_entries_created on rto_inward_entries(created_at desc);

-- Tracking snapshots for in-transit parcels to detect drops/disappearances
create table if not exists rto_intransit_history (
  id bigint generated always as identity primary key,
  awb_number text not null references orders(awb_number) on delete cascade,
  last_status text,
  disappeared_without_delivery boolean not null default false,
  detected_at timestamptz not null default now()
);

create index if not exists idx_rto_intransit_awb on rto_intransit_history(awb_number);

-- Short-lived OTP challenge, created when staff taps "Mark as received" and
-- consumed when they enter the code that was pushed to the owner's phone.
create table if not exists rto_otp_challenges (
  awb_number text primary key references orders(awb_number) on delete cascade,
  otp_code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ALERTS — unified feed that drives the dashboard + push notifications
-- ============================================================
create type alert_type as enum (
  'fake_attempt',
  'missing_parcel',
  'unresolved_ticket',
  'session_expired',
  'ticket_resolved',
  'new_agent_message'
);

create table if not exists alerts (
  id bigint generated always as identity primary key,
  type alert_type not null,
  awb_number text references orders(awb_number) on delete set null,
  ticket_id text,
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_alerts_created_at on alerts(created_at desc);
create index if not exists idx_alerts_unread on alerts(is_read) where is_read = false;

-- ============================================================
-- TICKETS + CHAT
-- ============================================================
create table if not exists tickets (
  ticket_id text primary key,
  status text not null default 'open', -- 'open' | 'closed' (ShopDeck status)
  subject text,
  opened_at timestamptz,
  closed_at timestamptz,
  user_status text not null default 'open', -- 'open' | 'solved' (Manual status)
  user_solved_at timestamptz,
  is_closed_by_shopdeck boolean not null default false,
  shopdeck_closed_at timestamptz,
  has_chat_messages boolean not null default false,
  ai_resolution_flag text not null default 'unreviewed', -- 'resolved' | 'needs_review' | 'unreviewed'
  ai_resolution_reasoning text,
  last_synced_at timestamptz not null default now()
);

create index if not exists idx_tickets_user_status on tickets(user_status);
create index if not exists idx_tickets_shopdeck_closed on tickets(is_closed_by_shopdeck);

create table if not exists chat_history (
  id bigint generated always as identity primary key,
  ticket_id text not null references tickets(ticket_id) on delete cascade,
  sender text not null, -- 'agent' | 'seller'
  message text not null,
  sent_at timestamptz not null default now()
);

create index if not exists idx_chat_history_ticket on chat_history(ticket_id, sent_at);

create table if not exists chat_thread_summary (
  ticket_id text primary key references tickets(ticket_id) on delete cascade,
  rolling_summary text,
  last_updated timestamptz not null default now()
);

-- ============================================================
-- PUSH SUBSCRIPTIONS — Web Push endpoints for the installed PWA
-- ============================================================
create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security — locked down; only the service role key is used.
-- ============================================================
alter table settings enable row level security;
alter table orders enable row level security;
alter table ndr_attempt_history enable row level security;
alter table ndr_logs enable row level security;
alter table rto_inward_log enable row level security;
alter table rto_inward_entries enable row level security;
alter table rto_intransit_history enable row level security;
alter table alerts enable row level security;
alter table tickets enable row level security;
alter table chat_history enable row level security;
alter table chat_thread_summary enable row level security;
alter table push_subscriptions enable row level security;

-- ============================================================
-- Storage buckets
-- ============================================================
insert into storage.buckets (id, name, public)
values ('ndr-recordings', 'ndr-recordings', false),
       ('rto-files', 'rto-files', true)
on conflict (id) do nothing;
