-- ============================================================
-- PocketQuartermaster — Initial Schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

create type unit_role as enum (
  'quartermaster',
  'assistant_quartermaster',
  'youth_quartermaster',
  'member'
);

create type container_type as enum (
  'tote',
  'shelf',
  'stuff_sack',
  'compartment',
  'cooler',
  'bag',
  'other'
);

create type container_purpose as enum (
  'camping',   -- goes on trips
  'storage',   -- stays behind, replenishes camping bins
  'both'
);

create type notification_channel as enum ('push', 'email', 'both', 'none');

-- ============================================================
-- PROFILES
-- extends Supabase auth.users
-- ============================================================

create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- UNITS
-- ============================================================

create table units (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  accent_color  text not null default '#2d5a27',
  created_by    uuid not null references profiles(id),
  created_at    timestamptz not null default now()
);

-- ============================================================
-- UNIT MEMBERS
-- ============================================================

create table unit_members (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references units(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  role        unit_role not null default 'member',
  invited_by  uuid references profiles(id),
  joined_at   timestamptz not null default now(),
  unique (unit_id, user_id)
);

-- ============================================================
-- CONTAINERS (bins, totes, shelves, etc.)
-- ============================================================

create table containers (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references units(id) on delete cascade,
  name        text not null,
  type        container_type not null default 'tote',
  purpose     container_purpose not null default 'camping',
  notes       text,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- ITEMS
-- What a unit carries (unit-level, not container-level)
-- ============================================================

create table items (
  id                      uuid primary key default gen_random_uuid(),
  unit_id                 uuid not null references units(id) on delete cascade,
  name                    text not null,
  category                text,
  unit_of_measure         text not null default 'each',  -- e.g. rolls, oz, cans
  min_quantity            integer,                        -- fixed floor (total across all containers)
  min_quantity_per_person numeric(6,2),                  -- headcount-based floor
  notes                   text,
  is_archived             boolean not null default false,
  created_at              timestamptz not null default now()
);

-- ============================================================
-- ITEM SLOTS
-- Defines which items BELONG in which container and
-- in what expected quantity (the "standard" — rarely changes)
-- ============================================================

create table item_slots (
  id                uuid primary key default gen_random_uuid(),
  item_id           uuid not null references items(id) on delete cascade,
  container_id      uuid not null references containers(id) on delete cascade,
  expected_quantity integer not null default 0,
  notes             text,
  created_at        timestamptz not null default now(),
  unique (item_id, container_id)
);

-- ============================================================
-- ITEM QUANTITIES
-- Current quantity of an item in a container.
-- Append-only log — latest row per slot is current state.
-- ============================================================

create table item_quantities (
  id            uuid primary key default gen_random_uuid(),
  slot_id       uuid not null references item_slots(id) on delete cascade,
  quantity      integer not null,
  updated_by    uuid not null references profiles(id),
  updated_at    timestamptz not null default now(),
  notes         text                -- e.g. "after June campout"
);

-- Convenience view: current quantity per slot (latest update)
create view current_quantities as
  select distinct on (slot_id)
    slot_id,
    quantity,
    updated_by,
    updated_at,
    notes
  from item_quantities
  order by slot_id, updated_at desc;

-- ============================================================
-- EXPIRATION LOTS
-- Tracks batches of an item with specific expiration dates
-- ============================================================

create table expiration_lots (
  id              uuid primary key default gen_random_uuid(),
  slot_id         uuid not null references item_slots(id) on delete cascade,
  quantity        integer not null,
  expiration_date date not null,
  added_by        uuid not null references profiles(id),
  added_at        timestamptz not null default now(),
  is_cleared      boolean not null default false  -- marked off during audit
);

-- ============================================================
-- TRIPS
-- ============================================================

create table trips (
  id               uuid primary key default gen_random_uuid(),
  unit_id          uuid not null references units(id) on delete cascade,
  name             text not null,
  trip_date        date not null,
  return_date      date,
  headcount        integer,
  shopping_lead_id uuid references profiles(id),
  notes            text,
  created_by       uuid not null references profiles(id),
  created_at       timestamptz not null default now()
);

-- ============================================================
-- SHOPPING ITEMS
-- Line items on a trip's shopping list.
-- item_id is null for trip-specific items (e.g. frozen meatballs)
-- that don't live in permanent inventory.
-- ============================================================

create table shopping_items (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references trips(id) on delete cascade,
  item_id             uuid references items(id) on delete set null,  -- null = trip-specific
  custom_name         text,                  -- used when item_id is null
  quantity_needed     integer not null,
  quantity_purchased  integer not null default 0,
  assigned_to         uuid references profiles(id),
  store               text,                  -- "King Soopers", "Costco", etc.
  is_purchased        boolean not null default false,
  notes               text,
  created_by          uuid not null references profiles(id),
  created_at          timestamptz not null default now(),
  check (item_id is not null or custom_name is not null)  -- must have one or the other
);

-- ============================================================
-- AUDIT SCHEDULES
-- ============================================================

create table audit_schedules (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references units(id) on delete cascade,
  frequency_days  integer not null default 90,  -- e.g. 90 = quarterly
  next_audit_date date not null,
  notify_roles    unit_role[] not null default array['quartermaster']::unit_role[],
  created_at      timestamptz not null default now()
);

-- ============================================================
-- AUDIT RECORDS
-- ============================================================

create table audit_records (
  id            uuid primary key default gen_random_uuid(),
  unit_id       uuid not null references units(id) on delete cascade,
  conducted_by  uuid not null references profiles(id),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  notes         text
);

-- ============================================================
-- AUDIT LINE ITEMS
-- Per-item results of an audit
-- ============================================================

create table audit_line_items (
  id                uuid primary key default gen_random_uuid(),
  audit_id          uuid not null references audit_records(id) on delete cascade,
  slot_id           uuid not null references item_slots(id),
  expected_quantity integer not null,
  actual_quantity   integer,
  is_present        boolean,
  notes             text
);

-- ============================================================
-- NOTIFICATION PREFERENCES
-- unit_id + user_id both set   = user override for that unit
-- unit_id set, user_id null    = unit-level default
-- ============================================================

create table notification_prefs (
  id                  uuid primary key default gen_random_uuid(),
  unit_id             uuid not null references units(id) on delete cascade,
  user_id             uuid references profiles(id) on delete cascade,
  low_stock           notification_channel not null default 'push',
  expiration          notification_channel not null default 'both',
  audit_reminder      notification_channel not null default 'both',
  trip_reminder       notification_channel not null default 'push',
  unique (unit_id, user_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Users can only see data for units they belong to
-- ============================================================

alter table units               enable row level security;
alter table unit_members        enable row level security;
alter table containers          enable row level security;
alter table items               enable row level security;
alter table item_slots          enable row level security;
alter table item_quantities     enable row level security;
alter table expiration_lots     enable row level security;
alter table trips               enable row level security;
alter table shopping_items      enable row level security;
alter table audit_schedules     enable row level security;
alter table audit_records       enable row level security;
alter table audit_line_items    enable row level security;
alter table notification_prefs  enable row level security;
alter table profiles            enable row level security;

-- Helper: is the current user a member of a given unit?
create or replace function is_unit_member(unit uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from unit_members
    where unit_id = unit and user_id = auth.uid()
  );
$$;

-- Helper: is the current user a QM or AQM of a given unit?
create or replace function is_unit_qm(unit uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from unit_members
    where unit_id = unit
      and user_id = auth.uid()
      and role in ('quartermaster', 'assistant_quartermaster')
  );
$$;

-- profiles: users can read all profiles (for name display), edit only their own
create policy "profiles_read"   on profiles for select using (true);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- units: readable by members, insertable by anyone (to create a new unit)
create policy "units_read"   on units for select using (is_unit_member(id));
create policy "units_insert" on units for insert with check (auth.uid() = created_by);
create policy "units_update" on units for update using (is_unit_qm(id));

-- unit_members: readable by unit members, managed by QMs
create policy "members_read"   on unit_members for select using (is_unit_member(unit_id));
create policy "members_insert" on unit_members for insert with check (is_unit_qm(unit_id) or auth.uid() = user_id);
create policy "members_update" on unit_members for update using (is_unit_qm(unit_id));
create policy "members_delete" on unit_members for delete using (is_unit_qm(unit_id));

-- containers, items, item_slots: all unit members can read and write
create policy "containers_all" on containers      using (is_unit_member(unit_id)) with check (is_unit_member(unit_id));
create policy "items_all"      on items           using (is_unit_member(unit_id)) with check (is_unit_member(unit_id));
create policy "slots_all"      on item_slots      using (is_unit_member((select unit_id from items where id = item_id)));

-- item_quantities: all members can read and append
create policy "quantities_read"   on item_quantities for select using (
  is_unit_member((select i.unit_id from item_slots s join items i on i.id = s.item_id where s.id = slot_id))
);
create policy "quantities_insert" on item_quantities for insert with check (
  is_unit_member((select i.unit_id from item_slots s join items i on i.id = s.item_id where s.id = slot_id))
);

-- expiration_lots: same as quantities
create policy "expirations_read"   on expiration_lots for select using (
  is_unit_member((select i.unit_id from item_slots s join items i on i.id = s.item_id where s.id = slot_id))
);
create policy "expirations_insert" on expiration_lots for insert with check (
  is_unit_member((select i.unit_id from item_slots s join items i on i.id = s.item_id where s.id = slot_id))
);
create policy "expirations_update" on expiration_lots for update using (
  is_unit_member((select i.unit_id from item_slots s join items i on i.id = s.item_id where s.id = slot_id))
);

-- trips and shopping: all members read/write
create policy "trips_all"    on trips          using (is_unit_member(unit_id)) with check (is_unit_member(unit_id));
create policy "shopping_all" on shopping_items using (is_unit_member((select unit_id from trips where id = trip_id)));

-- audits: all members read, all can conduct
create policy "audit_schedules_all"  on audit_schedules  using (is_unit_member(unit_id)) with check (is_unit_member(unit_id));
create policy "audit_records_all"    on audit_records    using (is_unit_member(unit_id)) with check (is_unit_member(unit_id));
create policy "audit_lines_all"      on audit_line_items using (
  is_unit_member((select unit_id from audit_records where id = audit_id))
);

-- notification_prefs: members manage their own, QMs manage unit defaults
create policy "notif_read"   on notification_prefs for select using (is_unit_member(unit_id));
create policy "notif_insert" on notification_prefs for insert with check (
  is_unit_member(unit_id) and (user_id = auth.uid() or is_unit_qm(unit_id))
);
create policy "notif_update" on notification_prefs for update using (
  user_id = auth.uid() or is_unit_qm(unit_id)
);

-- ============================================================
-- INDEXES for common query patterns
-- ============================================================

create index on unit_members (user_id);
create index on unit_members (unit_id);
create index on items (unit_id);
create index on containers (unit_id);
create index on item_slots (item_id);
create index on item_slots (container_id);
create index on item_quantities (slot_id, updated_at desc);
create index on expiration_lots (slot_id);
create index on expiration_lots (expiration_date) where is_cleared = false;
create index on trips (unit_id, trip_date);
create index on shopping_items (trip_id);
