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

create or replace function public.attempt_booking(
  p_booking_id uuid,
  p_title text,
  p_user_name text,
  p_requested_car_option text,
  p_start_datetime timestamptz,
  p_end_datetime timestamptz,
  p_is_urgent boolean,
  p_note text
)
returns jsonb
language plpgsql
as $$
declare
  is_parent boolean;
  preferred_car text;
  fallback_car text;
  resolved_assigned_cars text[];
  exact_existing_booking_id uuid;
  exact_reserved_cars text[];
  has_exact_white boolean;
  has_exact_red boolean;
  intersects_exact_reserved boolean;
  has_self_conflicts boolean;
  has_other_conflicts boolean;
  override_count integer := 0;
  affected_user_name text;
  affected_start_datetime timestamptz;
  affected_end_datetime timestamptz;
begin
  if p_start_datetime >= p_end_datetime then
    return jsonb_build_object(
      'decision', 'blocked',
      'message', 'Please choose a valid time range and an available slot.'
    );
  end if;

  is_parent := p_user_name in ('Dad', 'Mom');

  if p_is_urgent and not is_parent then
    return jsonb_build_object(
      'decision', 'blocked',
      'message', 'Only Mom and Dad can use urgent override.'
    );
  end if;

  if p_requested_car_option = 'white' then
    resolved_assigned_cars := array['white'];
  elsif p_requested_car_option = 'red' then
    resolved_assigned_cars := array['red'];
  elsif p_requested_car_option = 'bothCars' then
    resolved_assigned_cars := array['white', 'red'];
  elsif p_requested_car_option = 'noPreference' then
    preferred_car := case
      when p_user_name in ('Dad', 'Noa', 'Yuval') then 'white'
      else 'red'
    end;
    fallback_car := case when preferred_car = 'white' then 'red' else 'white' end;

    if not exists (
      select 1
      from public.bookings b
      where b.status = 'active'
        and b.start_datetime < p_end_datetime
        and b.end_datetime > p_start_datetime
        and preferred_car = any(b.assigned_cars)
    ) then
      resolved_assigned_cars := array[preferred_car];
    elsif not exists (
      select 1
      from public.bookings b
      where b.status = 'active'
        and b.start_datetime < p_end_datetime
        and b.end_datetime > p_start_datetime
        and fallback_car = any(b.assigned_cars)
    ) then
      resolved_assigned_cars := array[fallback_car];
    elsif p_is_urgent and is_parent then
      resolved_assigned_cars := array[preferred_car];
    else
      return jsonb_build_object(
        'decision', 'blocked',
        'message', 'No car is available in this time range for automatic assignment.'
      );
    end if;
  else
    return jsonb_build_object(
      'decision', 'blocked',
      'message', 'Please choose a valid time range and an available slot.'
    );
  end if;

  select
    min(b.id),
    coalesce(array_agg(distinct c.car), array[]::text[])
  into
    exact_existing_booking_id,
    exact_reserved_cars
  from public.bookings b
  left join lateral unnest(b.assigned_cars) as c(car) on true
  where b.user_name = p_user_name
    and b.status = 'active'
    and b.start_datetime = p_start_datetime
    and b.end_datetime = p_end_datetime;

  has_exact_white := 'white' = any(exact_reserved_cars);
  has_exact_red := 'red' = any(exact_reserved_cars);
  intersects_exact_reserved := exists (
    select 1
    from unnest(resolved_assigned_cars) as r(car)
    where r.car = any(exact_reserved_cars)
  );

  if exact_existing_booking_id is not null then
    if (has_exact_white and has_exact_red)
      or (array['white', 'red']::text[] <@ resolved_assigned_cars)
    then
      return jsonb_build_object(
        'decision', 'blocked',
        'message', 'You already have a booking for both cars at this exact time. New booking was not created.'
      );
    end if;

    if intersects_exact_reserved then
      return jsonb_build_object(
        'decision', 'blocked',
        'message', 'You already have this exact booking time and car. New booking was not created.'
      );
    end if;

    return jsonb_build_object(
      'decision', 'needs_both_cars_decision',
      'message', 'You already have a booking at this exact time on a different car. You may want both cars, or this might be a duplicate by mistake.',
      'existingBookingId', exact_existing_booking_id
    );
  end if;

  select exists (
    select 1
    from public.bookings b
    where b.status = 'active'
      and b.user_name = p_user_name
      and b.start_datetime < p_end_datetime
      and b.end_datetime > p_start_datetime
      and b.assigned_cars && resolved_assigned_cars
  ) into has_self_conflicts;

  if has_self_conflicts then
    return jsonb_build_object(
      'decision', 'blocked',
      'message', 'You cannot override your own booking. Please delete or change your existing booking first.'
    );
  end if;

  select exists (
    select 1
    from public.bookings b
    where b.status = 'active'
      and b.user_name <> p_user_name
      and b.start_datetime < p_end_datetime
      and b.end_datetime > p_start_datetime
      and b.assigned_cars && resolved_assigned_cars
  ) into has_other_conflicts;

  if has_other_conflicts and not (p_is_urgent and is_parent) then
    return jsonb_build_object(
      'decision', 'blocked',
      'message', 'Please choose a valid time range and an available slot.'
    );
  end if;

  insert into public.bookings (
    id,
    title,
    user_name,
    requested_car_option,
    assigned_cars,
    start_datetime,
    end_datetime,
    is_urgent,
    note,
    status,
    overridden_by_booking_id,
    notified,
    created_at
  ) values (
    p_booking_id,
    p_title,
    p_user_name,
    p_requested_car_option,
    resolved_assigned_cars,
    p_start_datetime,
    p_end_datetime,
    p_is_urgent,
    p_note,
    'active',
    null,
    false,
    now()
  );

  if p_is_urgent and is_parent and has_other_conflicts then
    with affected as (
      select id, user_name, start_datetime, end_datetime
      from public.bookings
      where status = 'active'
        and user_name <> p_user_name
        and start_datetime < p_end_datetime
        and end_datetime > p_start_datetime
        and assigned_cars && resolved_assigned_cars
      for update
    ),
    updated as (
      update public.bookings b
      set
        status = 'overridden',
        overridden_by_booking_id = p_booking_id,
        notified = false
      from affected a
      where b.id = a.id
      returning a.user_name, a.start_datetime, a.end_datetime
    )
    select
      count(*),
      min(user_name),
      min(start_datetime),
      min(end_datetime)
    into
      override_count,
      affected_user_name,
      affected_start_datetime,
      affected_end_datetime
    from updated;

    return jsonb_build_object(
      'decision', 'created_with_override',
      'message', format('Urgent booking saved. %s booking(s) were overridden.', override_count),
      'affectedUserName', affected_user_name,
      'affectedStartDateTime', affected_start_datetime,
      'affectedEndDateTime', affected_end_datetime,
      'overrideCount', override_count
    );
  end if;

  return jsonb_build_object(
    'decision', 'created',
    'message', 'Booking saved successfully.'
  );
end;
$$;

create or replace function public.confirm_exact_time_both_cars(
  p_booking_id uuid,
  p_user_name text
)
returns void
language plpgsql
as $$
begin
  update public.bookings
  set
    requested_car_option = 'bothCars',
    assigned_cars = array['white', 'red']
  where id = p_booking_id
    and user_name = p_user_name
    and status = 'active';
end;
$$;
```

> Note: This is intentionally open for a simple family shared app with no auth.
