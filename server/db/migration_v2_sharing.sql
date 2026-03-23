-- Migration v2: Collaborative Sharing
-- Run this if you already have the v1 schema

-- Add share columns to trips
alter table trips add column if not exists share_token uuid default null;
alter table trips add column if not exists share_role text check (share_role in ('editor', 'viewer')) default 'editor';
alter table trips add column if not exists share_token_expires_at timestamptz default null;

-- Create collaborators table
create table if not exists trip_collaborators (
  id uuid primary key default uuid_generate_v4(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')) default 'editor',
  created_at timestamptz not null default now(),
  unique(trip_id, user_id)
);

create index if not exists idx_collab_trip on trip_collaborators(trip_id);
create index if not exists idx_collab_user on trip_collaborators(user_id);

-- Helper functions
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

-- Drop old policies
drop policy if exists "trips_owner" on trips;
drop policy if exists "activities_owner" on trip_activities;
drop policy if exists "days_owner" on itinerary_days;
drop policy if exists "items_owner" on itinerary_items;

-- Enable RLS on collaborators
alter table trip_collaborators enable row level security;

-- New trips policies
create policy "trips_select" on trips
  for select using (user_id = auth.uid() or is_trip_collaborator(id));
create policy "trips_insert" on trips
  for insert with check (user_id = auth.uid());
create policy "trips_update" on trips
  for update using (is_trip_editor(id));
create policy "trips_delete" on trips
  for delete using (user_id = auth.uid());

-- Collaborator policies
create policy "collab_select" on trip_collaborators
  for select using (is_trip_owner_or_collaborator(trip_id));
create policy "collab_insert" on trip_collaborators
  for insert with check (
    exists (select 1 from trips where id = trip_id and user_id = auth.uid())
    or user_id = auth.uid()
  );
create policy "collab_delete" on trip_collaborators
  for delete using (
    exists (select 1 from trips where id = trip_id and user_id = auth.uid())
    or user_id = auth.uid()
  );

-- Activities policies
create policy "activities_select" on trip_activities
  for select using (is_trip_owner_or_collaborator(trip_id));
create policy "activities_insert" on trip_activities
  for insert with check (is_trip_editor(trip_id));
create policy "activities_update" on trip_activities
  for update using (is_trip_editor(trip_id));
create policy "activities_delete" on trip_activities
  for delete using (is_trip_editor(trip_id));

-- Days policies
create policy "days_select" on itinerary_days
  for select using (is_trip_owner_or_collaborator(trip_id));
create policy "days_insert" on itinerary_days
  for insert with check (is_trip_editor(trip_id));
create policy "days_update" on itinerary_days
  for update using (is_trip_editor(trip_id));
create policy "days_delete" on itinerary_days
  for delete using (is_trip_editor(trip_id));

-- Items policies
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
