-- ═══════════════════════════════════════════════════════════════════
-- OAU TRANSIT — Supabase Database Setup
-- Run this entire file in your Supabase SQL Editor (once)
-- ═══════════════════════════════════════════════════════════════════

-- ─── EXTENSIONS ─────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── DROP EXISTING (for clean re-runs during dev) ────────────────────
drop table if exists public.student_pins cascade;
drop table if exists public.ride_requests cascade;
drop table if exists public.buses cascade;
drop table if exists public.trips cascade;
drop table if exists public.stats cascade;
drop table if exists public.accounts cascade;

-- ─── ACCOUNTS ───────────────────────────────────────────────────────
create table public.accounts (
  id           text primary key,
  password     text not null,
  role         text not null check (role in ('student','driver','admin')),
  name         text not null,
  -- student-specific
  level        text,
  dept         text,
  -- driver-specific
  bus          text,
  plate        text,
  -- admin-specific
  title        text,
  created_at   timestamptz default now()
);

-- Seed demo accounts
insert into public.accounts (id, password, role, name, level, dept) values
  ('170405001', 'pass', 'student', 'Adebayo Okonkwo', '400L', 'Computer Science'),
  ('170405002', 'pass', 'student', 'Fatima Aliyu', '300L', 'Electrical Engineering'),
  ('170405003', 'pass', 'student', 'Chukwuemeka Obi', '200L', 'Medicine'),
  ('170405004', 'pass', 'student', 'Ngozi Eze', '500L', 'Law'),
  ('170405005', 'pass', 'student', 'Taiwo Adeyemi', '100L', 'Economics'),
  ('student',   'pass', 'student', 'Demo Student',   '300L', 'Computer Science');

insert into public.accounts (id, password, role, name, bus, plate) values
  ('driver1', 'pass', 'driver', 'Mr. Adekunle Bello', 'OAU-BUS-01', 'OY 123 AA'),
  ('driver2', 'pass', 'driver', 'Mr. Emeka Nwosu',    'OAU-BUS-02', 'OY 456 BB'),
  ('driver3', 'pass', 'driver', 'Mr. Kabir Musa',     'OAU-BUS-03', 'OY 789 CC'),
  ('driver4', 'pass', 'driver', 'Mr. Seun Adegoke',   'OAU-BUS-04', 'OY 012 DD');

insert into public.accounts (id, password, role, name, title) values
  ('admin', 'pass', 'admin', 'Prof. Adewale Oyewole', 'Director of Transport');

-- ─── BUSES ──────────────────────────────────────────────────────────
create table public.buses (
  id                  text primary key,
  driver_id           text references public.accounts(id),
  driver_name         text,
  plate               text,
  lat                 double precision not null,
  lng                 double precision not null,
  status              text not null default 'offline'
                        check (status in ('offline','idle','en_route_pickup','en_route_delivery')),
  capacity            int default 30,
  passengers          int default 0,
  route               text,
  destination         text,
  destination_coords  jsonb,
  current_trip        text,
  trip_students       int default 0,
  last_update         bigint default extract(epoch from now())*1000
);

-- Seed buses
insert into public.buses (id, driver_id, driver_name, plate, lat, lng, status, capacity, route) values
  ('OAU-BUS-01', 'driver1', 'Mr. Adekunle Bello', 'OY 123 AA', 7.5190, 4.5220, 'offline', 30, 'Main Gate ↔ Library'),
  ('OAU-BUS-02', 'driver2', 'Mr. Emeka Nwosu',    'OY 456 BB', 7.5160, 4.5250, 'offline', 30, 'Sports ↔ Main Gate'),
  ('OAU-BUS-03', 'driver3', 'Mr. Kabir Musa',     'OY 789 CC', 7.5200, 4.5270, 'offline', 30, 'Moremi ↔ Main Gate'),
  ('OAU-BUS-04', 'driver4', 'Mr. Seun Adegoke',   'OY 012 DD', 7.5145, 4.5230, 'offline', 30, 'Fajuyi ↔ Library');

-- ─── RIDE REQUESTS ──────────────────────────────────────────────────
create table public.ride_requests (
  id            uuid primary key default uuid_generate_v4(),
  location      text not null unique,
  destination   text,
  students      jsonb not null default '[]',
  status        text not null default 'waiting'
                  check (status in ('waiting','pending_bus','dispatched','delivering','completed')),
  assigned_bus  text references public.buses(id),
  dispatch_time bigint,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─── STUDENT PINS ────────────────────────────────────────────────────
create table public.student_pins (
  student_id  text primary key,
  name        text not null,
  lat         double precision not null,
  lng         double precision not null,
  created_at  timestamptz default now()
);

-- Auto-cleanup pins older than 5 minutes (via cron or handled in app)
-- We'll handle this in the app layer for simplicity.

-- ─── TRIPS LOG ───────────────────────────────────────────────────────
create table public.trips (
  id          bigserial primary key,
  bus_id      text references public.buses(id),
  from_loc    text,
  to_loc      text,
  students    int default 0,
  status      text default 'pickup',
  created_at  timestamptz default now()
);

-- ─── STATS ───────────────────────────────────────────────────────────
create table public.stats (
  key            text primary key,
  value          bigint default 0,
  updated_at     timestamptz default now()
);

insert into public.stats (key, value) values
  ('students_served', 0),
  ('trips_completed', 0);


-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
alter table public.accounts      enable row level security;
alter table public.buses         enable row level security;
alter table public.ride_requests enable row level security;
alter table public.student_pins  enable row level security;
alter table public.trips         enable row level security;
alter table public.stats         enable row level security;

-- Allow anon read/write for all (this is a campus app using anon key)
-- In production, use authenticated sessions. For the demo, anon access is fine.

create policy "anon_all_accounts"      on public.accounts      for all using (true) with check (true);
create policy "anon_all_buses"         on public.buses         for all using (true) with check (true);
create policy "anon_all_requests"      on public.ride_requests for all using (true) with check (true);
create policy "anon_all_pins"          on public.student_pins  for all using (true) with check (true);
create policy "anon_all_trips"         on public.trips         for all using (true) with check (true);
create policy "anon_all_stats"         on public.stats         for all using (true) with check (true);


-- ═══════════════════════════════════════════════════════════════════
-- REALTIME
-- Enable Realtime for all relevant tables
-- ═══════════════════════════════════════════════════════════════════

-- In Supabase dashboard → Database → Replication, enable these tables:
-- buses, ride_requests, student_pins, stats
-- OR run the following (requires superuser on some Supabase plans):

-- alter publication supabase_realtime add table public.buses;
-- alter publication supabase_realtime add table public.ride_requests;
-- alter publication supabase_realtime add table public.student_pins;
-- alter publication supabase_realtime add table public.stats;

-- ─── HELPER FUNCTIONS ────────────────────────────────────────────────

-- Increment stats helper
create or replace function increment_stat(stat_key text, amount int default 1)
returns void language plpgsql as $$
begin
  insert into public.stats (key, value, updated_at)
  values (stat_key, amount, now())
  on conflict (key) do update
  set value = stats.value + amount, updated_at = now();
end;
$$;

-- Auto-cleanup stale student pins (call this periodically or via pg_cron)
create or replace function cleanup_stale_pins()
returns void language plpgsql as $$
begin
  delete from public.student_pins
  where created_at < now() - interval '5 minutes';
end;
$$;

-- ─── INDEXES ─────────────────────────────────────────────────────────
create index if not exists idx_requests_status      on public.ride_requests(status);
create index if not exists idx_requests_assigned     on public.ride_requests(assigned_bus);
create index if not exists idx_buses_status          on public.buses(status);
create index if not exists idx_pins_created_at       on public.student_pins(created_at);
create index if not exists idx_trips_created_at      on public.trips(created_at desc);

-- ═══════════════════════════════════════════════════════════════════
-- DONE! Your OAU Transit database is ready.
-- Next steps:
--   1. Copy your project URL and anon key from Settings → API
--   2. Paste them into backend.js (SUPABASE_URL and SUPABASE_ANON_KEY)
--   3. In Supabase Dashboard → Database → Replication,
--      enable Realtime for: buses, ride_requests, student_pins, stats
-- ═══════════════════════════════════════════════════════════════════
