-- ============================================================
-- MIGRATION: NDR, RTO & Ticket Manual Management
-- Run this in Supabase → SQL Editor → New Query → Run
-- ============================================================

-- 1. Add called_at index to ndr_logs for faster today-filter
create index if not exists idx_ndr_logs_called_at on ndr_logs(called_at desc);

-- 2. RTO Inward Entries table (proof files with time logs)
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

alter table rto_inward_entries enable row level security;

-- 3. RTO In-Transit History (for drop detection)
create table if not exists rto_intransit_history (
  id bigint generated always as identity primary key,
  awb_number text not null references orders(awb_number) on delete cascade,
  last_status text,
  disappeared_without_delivery boolean not null default false,
  detected_at timestamptz not null default now()
);

create index if not exists idx_rto_intransit_awb on rto_intransit_history(awb_number);

alter table rto_intransit_history enable row level security;

-- 4. New settings keys for RTO baseline
insert into settings (key, value) values
  ('rto_initial_total', '0'),
  ('rto_baseline_date', null)
on conflict (key) do nothing;

-- 5. Add manual management columns to tickets
alter table tickets
  add column if not exists user_status text not null default 'open',
  add column if not exists user_solved_at timestamptz,
  add column if not exists is_closed_by_shopdeck boolean not null default false,
  add column if not exists shopdeck_closed_at timestamptz,
  add column if not exists has_chat_messages boolean not null default false;

create index if not exists idx_tickets_user_status on tickets(user_status);
create index if not exists idx_tickets_shopdeck_closed on tickets(is_closed_by_shopdeck);

-- 6. Storage bucket for RTO proof files
insert into storage.buckets (id, name, public)
values ('rto-files', 'rto-files', true)
on conflict (id) do nothing;

-- 7. Backfill is_closed_by_shopdeck for already-closed tickets
update tickets
  set is_closed_by_shopdeck = true,
      shopdeck_closed_at = closed_at
  where status = 'closed'
    and is_closed_by_shopdeck = false;
