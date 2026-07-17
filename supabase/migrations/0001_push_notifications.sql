-- Web Push notifications: subscriptions, reminder configuration, and the
-- server-side "already sent today" dedup ledger. Same RLS pattern as the
-- existing user_data table (auth.uid() = user_id on every operation).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  timezone text not null default 'UTC',
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reminder_times (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  field text not null,
  name text not null,
  time text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, field, name)
);

create table if not exists public.reminder_sent_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  field text not null,
  name text not null,
  sent_date date not null,
  sent_at timestamptz not null default now(),
  unique (user_id, field, name, sent_date)
);

alter table public.push_subscriptions enable row level security;
alter table public.reminder_times enable row level security;
alter table public.reminder_sent_log enable row level security;

create policy "Users can view own push subscriptions" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "Users can insert own push subscriptions" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "Users can update own push subscriptions" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own push subscriptions" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

create policy "Users can view own reminder times" on public.reminder_times
  for select using (auth.uid() = user_id);
create policy "Users can insert own reminder times" on public.reminder_times
  for insert with check (auth.uid() = user_id);
create policy "Users can update own reminder times" on public.reminder_times
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own reminder times" on public.reminder_times
  for delete using (auth.uid() = user_id);

-- reminder_sent_log is written only by the Edge Function via the service
-- role key (which bypasses RLS by design), but RLS is still enabled here as
-- defense in depth in case the anon/authenticated roles are ever granted
-- direct access to this table.
create policy "Users can view own sent log" on public.reminder_sent_log
  for select using (auth.uid() = user_id);
