-- Itinerary Planner Schema v2
-- Run this in your Supabase SQL Editor

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ─── Trips ───
create table if not exists trips (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Trip',
  start_date date not null,
  end_date date not null,
  stay_location jsonb, -- { lat, lng, address }
  config jsonb,        -- interests, transport, group_size, budget, cities array
  version int not null default 1,
  share_token uuid default null,
  share_role text check (share_role in ('editor', 'viewer')) default 'editor',
  share_token_expires_at timestamptz default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Trip Collaborators ───
create table if not exists trip_collaborators (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')) default 'editor',
  created_at timestamptz not null default now(),
  unique(trip_id, user_id)
);

-- ─── Trip Activities ───
-- Denormalized place data so we don't depend on Google API for loads
create table if not exists trip_activities (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references trips(id) on delete cascade,
  place_id text not null,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  duration int not null default 75,
  metadata jsonb, -- rating, price_level, types, address, photo, opening_hours
  created_at timestamptz not null default now(),
  unique(trip_id, place_id)
);

-- ─── Itinerary Days ───
create table if not exists itinerary_days (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references trips(id) on delete cascade,
  date date not null,
  city text,
  unique(trip_id, date, city)
);

-- ─── Itinerary Items ───
-- Each item references a day and an activity
create table if not exists itinerary_items (
  id uuid primary key default uuid_generate_v4(),
  day_id uuid not null references itinerary_days(id) on delete cascade,
  activity_id uuid not null references trip_activities(id) on delete cascade,
  start_time time not null,
  end_time time not null,
  order_index int not null default 0
);

-- ─── Helper Function ───
create or replace function is_trip_collaborator(tid uuid)
returns boolean as $$
  select exists (
    select 1 from trip_collaborators
    where trip_id = tid and user_id = auth.uid()
  );
$$ language sql security definer stable;

create or replace function is_trip_owner_or_collaborator(tid uuid)
returns boolean as $$
  select exists (
    select 1 from trips where id = tid and user_id = auth.uid()
  ) or is_trip_collaborator(tid);
$$ language sql security definer stable;

create or replace function is_trip_editor(tid uuid)
returns boolean as $$
  select exists (
    select 1 from trips where id = tid and user_id = auth.uid()
  ) or exists (
    select 1 from trip_collaborators
    where trip_id = tid and user_id = auth.uid() and role = 'editor'
  );
$$ language sql security definer stable;

-- ─── RLS Policies ───
alter table trips enable row level security;
alter table trip_collaborators enable row level security;
alter table trip_activities enable row level security;
alter table itinerary_days enable row level security;
alter table itinerary_items enable row level security;

-- Trips: owner or collaborator can read, owner can insert/delete, owner+editor can update
drop policy if exists "trips_owner" on trips;
create policy "trips_select" on trips
  for select using (user_id = auth.uid() or is_trip_collaborator(id));
create policy "trips_insert" on trips
  for insert with check (user_id = auth.uid());
create policy "trips_update" on trips
  for update using (is_trip_editor(id));
create policy "trips_delete" on trips
  for delete using (user_id = auth.uid());

-- Collaborators: owner or fellow collaborator can read, owner manages
drop policy if exists "collaborators_owner" on trip_collaborators;
create policy "collab_select" on trip_collaborators
  for select using (is_trip_owner_or_collaborator(trip_id));
create policy "collab_insert" on trip_collaborators
  for insert with check (
    exists (select 1 from trips where id = trip_id and user_id = auth.uid())
    or (
      user_id = auth.uid()
      and exists (
        select 1 from trips
        where id = trip_id
        and share_token is not null
        and (share_token_expires_at is null or share_token_expires_at > now())
      )
    )
  );
create policy "collab_delete" on trip_collaborators
  for delete using (
    exists (select 1 from trips where id = trip_id and user_id = auth.uid())
    or user_id = auth.uid()
  );

-- Activities: owner or collaborator with editor role
drop policy if exists "activities_owner" on trip_activities;
create policy "activities_select" on trip_activities
  for select using (is_trip_owner_or_collaborator(trip_id));
create policy "activities_insert" on trip_activities
  for insert with check (is_trip_editor(trip_id));
create policy "activities_update" on trip_activities
  for update using (is_trip_editor(trip_id));
create policy "activities_delete" on trip_activities
  for delete using (is_trip_editor(trip_id));

-- Days: owner or collaborator
drop policy if exists "days_owner" on itinerary_days;
create policy "days_select" on itinerary_days
  for select using (is_trip_owner_or_collaborator(trip_id));
create policy "days_insert" on itinerary_days
  for insert with check (is_trip_editor(trip_id));
create policy "days_update" on itinerary_days
  for update using (is_trip_editor(trip_id));
create policy "days_delete" on itinerary_days
  for delete using (is_trip_editor(trip_id));

-- Items: via day → trip
drop policy if exists "items_owner" on itinerary_items;
create policy "items_select" on itinerary_items
  for select using (
    day_id in (select id from itinerary_days where is_trip_owner_or_collaborator(trip_id))
  );
create policy "items_insert" on itinerary_items
  for insert with check (
    day_id in (select id from itinerary_days where is_trip_editor(trip_id))
  );
create policy "items_update" on itinerary_items
  for update using (
    day_id in (select id from itinerary_days where is_trip_editor(trip_id))
  );
create policy "items_delete" on itinerary_items
  for delete using (
    day_id in (select id from itinerary_days where is_trip_editor(trip_id))
  );

-- ─── Atomic Join Function (prevents race condition on collaborator limit) ───
create or replace function join_trip(p_trip_id uuid, p_user_id uuid, p_role text, p_max int default 5)
returns text as $$
declare
  current_count int;
begin
  -- Lock the collaborator rows for this trip to prevent concurrent inserts
  select count(*) into current_count
  from trip_collaborators
  where trip_id = p_trip_id
  for update;

  if current_count >= p_max then
    return 'full';
  end if;

  insert into trip_collaborators (trip_id, user_id, role)
  values (p_trip_id, p_user_id, p_role)
  on conflict (trip_id, user_id) do nothing;

  if not found then
    return 'already_member';
  end if;

  return 'joined';
end;
$$ language plpgsql security definer;

-- ─── Indexes ───
create index if not exists idx_trips_user on trips(user_id);
create index if not exists idx_activities_trip on trip_activities(trip_id);
create index if not exists idx_days_trip on itinerary_days(trip_id);
create index if not exists idx_items_day on itinerary_items(day_id);
create index if not exists idx_collab_trip on trip_collaborators(trip_id);
create index if not exists idx_collab_user on trip_collaborators(user_id);
