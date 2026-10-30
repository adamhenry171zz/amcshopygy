-- Henry OS initial foundation; execute ONLY in a dedicated Supabase project after review.
create extension if not exists pgcrypto;
create table if not exists public.henry_owner_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.henry_businesses (
 id text primary key check(id in ('amc','mystic')),
 name text not null
);
insert into public.henry_businesses(id,name) values ('amc','AMC Shopping'),('mystic','Mystic Media Management') on conflict (id) do nothing;
create or replace function public.henry_is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.henry_owner_users o where o.user_id = (select auth.uid()));
$$;
create table if not exists public.henry_customers (
 id uuid primary key default gen_random_uuid(),
 business_id text not null references public.henry_businesses(id),
 display_name text not null,
 contact text,
 notes text,
 created_at timestamptz not null default now()
);
create table if not exists public.henry_requests (
 id uuid primary key default gen_random_uuid(),
 business_id text not null references public.henry_businesses(id),
 customer_id uuid references public.henry_customers(id),
 kind text not null,
 title text not null,
 details text,
 status text not null default 'awaiting_review' check(status in ('awaiting_review','awaiting_quote','awaiting_payment','scheduled','in_progress','completed','cancelled')),
 requested_at timestamptz,
 location_label text,
 latitude numeric(10,7),
 longitude numeric(10,7),
 quote_gyd numeric(14,2) check(quote_gyd is null or quote_gyd >= 0),
 payment_verified boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.henry_tasks (
 id uuid primary key default gen_random_uuid(),
 business_id text not null references public.henry_businesses(id),
 title text not null,
 notes text,
 due_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.henry_audit_log (
 id bigint generated always as identity primary key,
 business_id text references public.henry_businesses(id),
 actor uuid references auth.users(id),
 action text not null,
 entity_type text not null,
 entity_id uuid,
 occurred_at timestamptz not null default now()
);
alter table public.henry_owner_users enable row level security;
alter table public.henry_businesses enable row level security;
alter table public.henry_customers enable row level security;
alter table public.henry_requests enable row level security;
alter table public.henry_tasks enable row level security;
alter table public.henry_audit_log enable row level security;
create policy "owner read self" on public.henry_owner_users for select to authenticated using (user_id = (select auth.uid()));
create policy "owner read businesses" on public.henry_businesses for select to authenticated using (public.henry_is_owner());
create policy "owner manage customers" on public.henry_customers for all to authenticated using (public.henry_is_owner()) with check (public.henry_is_owner());
create policy "owner manage requests" on public.henry_requests for all to authenticated using (public.henry_is_owner()) with check (public.henry_is_owner());
create policy "owner manage tasks" on public.henry_tasks for all to authenticated using (public.henry_is_owner()) with check (public.henry_is_owner());
create policy "owner read audit" on public.henry_audit_log for select to authenticated using (public.henry_is_owner());
-- No owner insert policy: provision first owner using trusted server-side admin access only.
-- No public insert policy: customer-facing forms must use verified server endpoints with rate limits.
-- Audit inserts must be implemented via trusted server functions.
