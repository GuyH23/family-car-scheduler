# Supabase Setup

Run this SQL in your Supabase SQL editor:

```sql
create table if not exists public.bookings (
  id uuid primary key,
  title text,
  user_name text not null check (user_name in ('Dad', 'Mom', 'Noa', 'Yuval')),
  requested_car_option text not null check (requested_car_option in ('white', 'red', 'noPreference', 'bothCars')),
  assigned_cars text[] not null,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  is_urgent boolean not null default false,
  note text,
  status text not null check (status in ('active', 'overridden')),
  overridden_by_booking_id uuid,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists bookings_start_datetime_idx on public.bookings (start_datetime);
create index if not exists bookings_user_name_idx on public.bookings (user_name);

alter table public.bookings enable row level security;

create policy "public read bookings"
on public.bookings
for select
to anon
using (true);

create policy "public insert bookings"
on public.bookings
for insert
to anon
with check (true);

create policy "public update bookings"
on public.bookings
for update
to anon
using (true)
with check (true);

create policy "public delete bookings"
on public.bookings
for delete
to anon
using (true);
```

> Note: This is intentionally open for a simple family shared app with no auth.
