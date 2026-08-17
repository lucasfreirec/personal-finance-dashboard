-- Run this in your Supabase SQL Editor (supabase.com > project > SQL Editor)

create table transactions (
  id text primary key,
  type text not null check (type in ('expense', 'income')),
  amount numeric not null,
  description text,
  category text,
  date date not null default current_date,
  account_id text not null,
  recurring_id text,
  source text default 'web',
  created_at timestamptz default now()
);

-- Index for fast "what's new since last sync" queries
create index idx_transactions_created on transactions (created_at);

-- Allow anonymous inserts/reads with the anon key (Row Level Security)
alter table transactions enable row level security;

create policy "Allow all access with anon key"
  on transactions for all
  using (true)
  with check (true);
