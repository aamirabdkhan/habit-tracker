-- Pehar home-screen widget feed.
-- Run this once in Supabase -> SQL Editor.
--
-- One row per user holds today's Pehar as JSON plus an unguessable token. The Scriptable
-- widget reads a single row by token through the SECURITY DEFINER function below (so there is
-- no table-wide anonymous read). Anyone with the token can read that user's schedule, so it is
-- an unguessable random UUID; regenerate it (below) to revoke.

create table if not exists public.widget_feed (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token      uuid not null default gen_random_uuid(),
  payload    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create unique index if not exists widget_feed_token_idx on public.widget_feed (token);

alter table public.widget_feed enable row level security;

-- The owner (authenticated user) manages only their own row.
drop policy if exists "widget_feed own select" on public.widget_feed;
create policy "widget_feed own select" on public.widget_feed
  for select using (auth.uid() = user_id);

drop policy if exists "widget_feed own insert" on public.widget_feed;
create policy "widget_feed own insert" on public.widget_feed
  for insert with check (auth.uid() = user_id);

drop policy if exists "widget_feed own update" on public.widget_feed;
create policy "widget_feed own update" on public.widget_feed
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Public read of ONE row by its token (used by the widget). Runs as definer, so it bypasses RLS
-- but can only ever return the single row whose token matches -- no enumeration.
create or replace function public.get_widget_feed(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select payload from public.widget_feed where token = p_token;
$$;

grant execute on function public.get_widget_feed(uuid) to anon;

-- To revoke a leaked token, rotate it (the user copies the new script afterwards):
--   update public.widget_feed set token = gen_random_uuid() where user_id = auth.uid();
