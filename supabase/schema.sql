-- =============================================================================
-- AttendPro: Supabase schema (PREPARED FOR LATER, NOT USED BY THE APP YET)
--
-- Run this in the Supabase SQL editor when you start the integration phase.
-- Nothing in the current frontend connects to Supabase.
--
-- Security model
--   * Auth: Supabase Auth (email + password). Passwords never touch your tables.
--   * Row Level Security on every table. The browser only ever holds the public
--     "anon" key; the service_role key must NEVER be put in front-end code.
--   * Check-in / check-out go through RPC functions that use SERVER time, so an
--     employee cannot spoof the clock.
--   * Half-day deductions can only be written by an admin. Nothing is automatic.
-- Requires PostgreSQL 15+ (views with security_invoker), the Supabase default.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- office rules
create table if not exists public.settings (
  id                    boolean primary key default true check (id),   -- single row
  timezone              text    not null default 'Asia/Kolkata',
  work_start            time    not null default '09:30',
  work_end              time    not null default '17:30',
  monthly_permission_min int    not null default 150,
  max_employees         int     not null default 9
);
insert into public.settings default values on conflict do nothing;

-- ------------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('admin', 'employee')),
  full_name   text not null,
  email       text not null unique,
  phone       text,
  designation text,
  join_date   date not null default current_date,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'admin' and active);
$$;

-- ----------------------------------------------------------------- attendance
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  work_date   date not null,
  check_in    timestamptz not null,
  check_out   timestamptz,
  unique (employee_id, work_date),
  check (check_out is null or check_out >= check_in)
);
create index if not exists attendance_date_idx on public.attendance (work_date);

-- ---------------------------------------------------------------- permissions
create table if not exists public.permissions (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  perm_date   date not null,
  start_time  time not null,
  end_time    time not null,
  minutes     int  generated always as (
                (extract(epoch from (end_time - start_time)) / 60)::int) stored,
  reason      text check (char_length(reason) <= 200),
  created_at  timestamptz not null default now(),
  check (end_time > start_time),
  check (start_time >= time '09:30' and end_time <= time '17:30'),
  check (extract(isodow from perm_date) <> 7)                -- Mon-Sat only
);
create index if not exists permissions_emp_month_idx on public.permissions (employee_id, perm_date);

-- ------------------------------------------- manual half-day deduction decisions
create table if not exists public.half_day_deductions (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.profiles (id) on delete cascade,
  month          date not null check (month = date_trunc('month', month)::date),  -- 1st of month
  decision       text not null check (decision in ('approved', 'declined')),
  days           numeric(3,1) not null default 0 check (days in (0, 0.5)),
  excess_minutes int  not null check (excess_minutes > 0),
  note           text check (char_length(note) <= 200),
  decided_by     uuid not null references public.profiles (id),
  decided_at     timestamptz not null default now()
);

-- ------------------------------------------------ monthly balance (resets by month)
-- Excess = minutes beyond 150 in that calendar month. Reporting only.
create or replace view public.monthly_permission_summary
with (security_invoker = true) as
select p.employee_id,
       date_trunc('month', p.perm_date)::date                    as month,
       sum(p.minutes)::int                                       as used_minutes,
       greatest(0, s.monthly_permission_min - sum(p.minutes))::int as remaining_minutes,
       greatest(0, sum(p.minutes) - s.monthly_permission_min)::int as excess_minutes
from public.permissions p cross join public.settings s
group by p.employee_id, date_trunc('month', p.perm_date), s.monthly_permission_min;

-- ------------------------------------------------------- check-in / check-out RPC
create or replace function public.check_in()
returns public.attendance language plpgsql security definer set search_path = public as $$
declare
  s public.settings; today date; rec public.attendance;
begin
  select * into s from public.settings;
  today := (now() at time zone s.timezone)::date;
  if extract(isodow from today) = 7 then raise exception 'Today is not a working day'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and active and role = 'employee') then
    raise exception 'Not an active employee';
  end if;
  insert into public.attendance (employee_id, work_date, check_in)
  values (auth.uid(), today, now()) returning * into rec;   -- unique constraint blocks double check-in
  return rec;
end $$;

create or replace function public.check_out()
returns public.attendance language plpgsql security definer set search_path = public as $$
declare
  s public.settings; today date; rec public.attendance;
begin
  select * into s from public.settings;
  today := (now() at time zone s.timezone)::date;
  update public.attendance set check_out = now()
   where employee_id = auth.uid() and work_date = today and check_out is null
   returning * into rec;
  if rec.id is null then raise exception 'No open check-in for today'; end if;
  return rec;
end $$;

revoke all on function public.check_in(), public.check_out() from public;
grant execute on function public.check_in(), public.check_out() to authenticated;

-- ----------------------------------------------------------- Row Level Security
alter table public.settings            enable row level security;
alter table public.profiles            enable row level security;
alter table public.attendance          enable row level security;
alter table public.permissions         enable row level security;
alter table public.half_day_deductions enable row level security;

create policy settings_read   on public.settings for select to authenticated using (true);
create policy settings_admin  on public.settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy profiles_read   on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_admin  on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- attendance: employees READ their own rows only; writes happen via the RPCs above
create policy attendance_read on public.attendance for select to authenticated
  using (employee_id = auth.uid() or public.is_admin());

-- permissions: employees record their own directly (no approval); admin may correct
create policy permissions_read   on public.permissions for select to authenticated
  using (employee_id = auth.uid() or public.is_admin());
create policy permissions_insert on public.permissions for insert to authenticated
  with check (employee_id = auth.uid()
              and perm_date between current_date - 7 and current_date + 30);
create policy permissions_delete on public.permissions for delete to authenticated
  using (public.is_admin());

-- deductions: admin-only writes; employees may read their own decisions
create policy deductions_read  on public.half_day_deductions for select to authenticated
  using (employee_id = auth.uid() or public.is_admin());
create policy deductions_admin on public.half_day_deductions for all to authenticated
  using (public.is_admin()) with check (public.is_admin() and decided_by = auth.uid());

-- ------------------------------------------------------------------ first admin
-- 1) Create the admin user in Supabase Dashboard > Authentication > Users.
-- 2) Then insert the matching profile (replace the id/email/name):
--    insert into public.profiles (id, role, full_name, email)
--    values ('<auth-user-uuid>', 'admin', 'Your Name', 'you@company.com');
