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
  google_event_id text,
  calendar_sync_status text not null default 'pending' check (calendar_sync_status in ('pending', 'synced', 'failed')),
  calendar_last_synced_at timestamptz,
  calendar_sync_error text,
  created_at timestamptz not null default now()
);

create index if not exists bookings_start_datetime_idx on public.bookings (start_datetime);
create index if not exists bookings_user_name_idx on public.bookings (user_name);
create index if not exists bookings_calendar_sync_status_idx on public.bookings (calendar_sync_status);

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
  p_note text,
  p_confirm_urgent_override boolean default false,
  p_override_booking_ids uuid[] default null
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
  exact_effective_cars text[];
  has_exact_white boolean;
  has_exact_red boolean;
  intersects_exact_reserved boolean;
  has_self_conflicts boolean;
  has_other_conflicts boolean;
  override_count integer := 0;
  affected_user_name text;
  affected_start_datetime timestamptz;
  affected_end_datetime timestamptz;
  conflicting_bookings jsonb := '[]'::jsonb;
  white_available boolean;
  red_available boolean;
  available_count integer;
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

  white_available := not exists (
    select 1
    from public.bookings b
    where b.status = 'active'
      and b.start_datetime < p_end_datetime
      and b.end_datetime > p_start_datetime
      and 'white' = any(b.assigned_cars)
  );

  red_available := not exists (
    select 1
    from public.bookings b
    where b.status = 'active'
      and b.start_datetime < p_end_datetime
      and b.end_datetime > p_start_datetime
      and 'red' = any(b.assigned_cars)
  );

  available_count := (case when white_available then 1 else 0 end)
                   + (case when red_available then 1 else 0 end);

  if p_requested_car_option = 'white' then
    if white_available then
      resolved_assigned_cars := array['white'];
    elsif p_is_urgent and is_parent then
      resolved_assigned_cars := array['white'];
    else
      return jsonb_build_object(
        'decision', 'blocked',
        'message', 'White car is not available in this time range.'
      );
    end if;
  elsif p_requested_car_option = 'red' then
    if red_available then
      resolved_assigned_cars := array['red'];
    elsif p_is_urgent and is_parent then
      resolved_assigned_cars := array['red'];
    else
      return jsonb_build_object(
        'decision', 'blocked',
        'message', 'Red car is not available in this time range.'
      );
    end if;
  elsif p_requested_car_option = 'bothCars' then
    if available_count = 2 then
      resolved_assigned_cars := array['white', 'red'];
    elsif p_is_urgent and is_parent then
      resolved_assigned_cars := array['white', 'red'];
    else
      return jsonb_build_object(
        'decision', 'blocked',
        'message', 'Both cars are required, but fewer than 2 cars are available in this time range.'
      );
    end if;
  elsif p_requested_car_option = 'noPreference' then
    preferred_car := case
      when p_user_name in ('Dad', 'Noa', 'Yuval') then 'white'
      else 'red'
    end;
    fallback_car := case when preferred_car = 'white' then 'red' else 'white' end;

    if (preferred_car = 'white' and white_available)
       or (preferred_car = 'red' and red_available) then
      resolved_assigned_cars := array[preferred_car];
    elsif (fallback_car = 'white' and white_available)
       or (fallback_car = 'red' and red_available) then
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

  resolved_assigned_cars := (
    select array_agg(distinct car order by car)
    from unnest(resolved_assigned_cars) as t(car)
  );

  if coalesce(array_length(resolved_assigned_cars, 1), 0) = 0
     or coalesce(array_length(resolved_assigned_cars, 1), 0) > 2
     or exists (
       select 1
       from unnest(resolved_assigned_cars) as t(car)
       where t.car not in ('white', 'red')
     ) then
    return jsonb_build_object(
      'decision', 'blocked',
      'message', 'Invalid car assignment for this booking.'
    );
  end if;

  select b.id
  into exact_existing_booking_id
  from public.bookings b
  where b.user_name = p_user_name
    and b.status = 'active'
    and b.start_datetime = p_start_datetime
    and b.end_datetime = p_end_datetime
  order by b.created_at asc, b.id asc
  limit 1;

  select coalesce(array_agg(distinct c.car), array[]::text[])
  into exact_reserved_cars
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
    if has_exact_white and has_exact_red then
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

    exact_effective_cars := (
      select array_agg(distinct car order by car)
      from (
        select unnest(exact_reserved_cars) as car
        union all
        select unnest(resolved_assigned_cars) as car
      ) merged
    );

    if exists (
      select 1
      from public.bookings b
      where b.status = 'active'
        and b.user_name <> p_user_name
        and b.start_datetime < p_end_datetime
        and b.end_datetime > p_start_datetime
        and b.assigned_cars && exact_effective_cars
    ) then
      return jsonb_build_object(
        'decision', 'blocked',
        'message', 'Cannot combine to both cars because one of the cars is already booked by another user in this time range.'
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

  if has_other_conflicts and p_is_urgent and is_parent and not p_confirm_urgent_override then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'userName', b.user_name,
          'title', coalesce(b.title, ''),
          'startDateTime', b.start_datetime,
          'endDateTime', b.end_datetime,
          'assignedCars', b.assigned_cars
        )
        order by b.start_datetime, b.created_at
      ),
      '[]'::jsonb
    )
    into conflicting_bookings
    from public.bookings b
    where b.status = 'active'
      and b.user_name <> p_user_name
      and b.start_datetime < p_end_datetime
      and b.end_datetime > p_start_datetime
      and b.assigned_cars && resolved_assigned_cars;

    select b.user_name, b.start_datetime, b.end_datetime
    into affected_user_name, affected_start_datetime, affected_end_datetime
    from public.bookings b
    where b.status = 'active'
      and b.user_name <> p_user_name
      and b.start_datetime < p_end_datetime
      and b.end_datetime > p_start_datetime
      and b.assigned_cars && resolved_assigned_cars
    order by b.start_datetime asc, b.created_at asc
    limit 1;

    return jsonb_build_object(
      'decision', 'needs_urgent_confirmation',
      'message', 'Urgent booking will override another user booking. Please confirm to continue.',
      'affectedUserName', affected_user_name,
      'affectedStartDateTime', affected_start_datetime,
      'affectedEndDateTime', affected_end_datetime,
      'conflictingCars', resolved_assigned_cars,
      'conflictingBookings', conflicting_bookings
    );
  end if;

  if has_other_conflicts and p_is_urgent and is_parent and p_confirm_urgent_override then
    if p_override_booking_ids is null or coalesce(array_length(p_override_booking_ids, 1), 0) = 0 then
      return jsonb_build_object(
        'decision', 'blocked',
        'message', 'Please select at least one booking to override.'
      );
    end if;

    if exists (
      select 1
      from public.bookings b
      where b.status = 'active'
        and b.user_name <> p_user_name
        and b.start_datetime < p_end_datetime
        and b.end_datetime > p_start_datetime
        and b.assigned_cars && resolved_assigned_cars
        and not (b.id = any(p_override_booking_ids))
    ) then
      return jsonb_build_object(
        'decision', 'blocked',
        'message', 'Selected overrides are not enough. Please select all conflicting bookings in this slot.'
      );
    end if;
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
        and (p_override_booking_ids is null or id = any(p_override_booking_ids))
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
declare
  booking_start timestamptz;
  booking_end timestamptz;
begin
  select start_datetime, end_datetime
  into booking_start, booking_end
  from public.bookings
  where id = p_booking_id
    and user_name = p_user_name
    and status = 'active'
  limit 1;

  if booking_start is null or booking_end is null then
    return;
  end if;

  if exists (
    select 1
    from public.bookings b
    where b.status = 'active'
      and b.user_name <> p_user_name
      and b.start_datetime < booking_end
      and b.end_datetime > booking_start
      and b.assigned_cars && array['white', 'red']::text[]
  ) then
    raise exception 'Cannot switch to both cars because one of the cars is already occupied in this time range.';
  end if;

  if exists (
    select 1
    from public.bookings b
    where b.status = 'active'
      and b.user_name = p_user_name
      and b.id <> p_booking_id
      and b.start_datetime = booking_start
      and b.end_datetime = booking_end
      and b.assigned_cars && array['white', 'red']::text[]
  ) then
    raise exception 'Cannot switch to both cars because another exact-time booking already reserves one of the cars.';
  end if;

  update public.bookings
  set
    requested_car_option = 'bothCars',
    assigned_cars = array['white', 'red']
  where id = p_booking_id
    and user_name = p_user_name
    and status = 'active';
end;
$$;

-- Existing projects: add sync columns if table already exists.
alter table public.bookings
  add column if not exists google_event_id text,
  add column if not exists calendar_sync_status text not null default 'pending',
  add column if not exists calendar_last_synced_at timestamptz,
  add column if not exists calendar_sync_error text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bookings_calendar_sync_status_check'
  ) then
    alter table public.bookings
      add constraint bookings_calendar_sync_status_check
      check (calendar_sync_status in ('pending', 'synced', 'failed'));
  end if;
end $$;

create table if not exists public.car_switch_requests (
  id uuid primary key,
  requester_name text not null check (requester_name in ('Dad', 'Mom', 'Noa', 'Yuval')),
  requested_user_name text not null check (requested_user_name in ('Dad', 'Mom', 'Noa', 'Yuval')),
  requester_booking_id uuid not null,
  requester_title text,
  requester_requested_car_option text not null check (requester_requested_car_option in ('white', 'red', 'noPreference', 'bothCars')),
  requester_start_datetime timestamptz not null,
  requester_end_datetime timestamptz not null,
  requested_booking_id uuid not null,
  requested_current_car text not null check (requested_current_car in ('white', 'red')),
  requested_target_car text not null check (requested_target_car in ('white', 'red')),
  status text not null default 'pending' check (status in ('pending', 'declined', 'cancelled', 'expired', 'applied')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists car_switch_requests_status_idx on public.car_switch_requests (status);
create index if not exists car_switch_requests_requester_idx on public.car_switch_requests (requester_name);
create index if not exists car_switch_requests_requested_idx on public.car_switch_requests (requested_user_name);
create index if not exists car_switch_requests_expires_idx on public.car_switch_requests (expires_at);

alter table public.car_switch_requests enable row level security;

create policy "public read car switch requests"
on public.car_switch_requests
for select
to anon
using (true);

create policy "public insert car switch requests"
on public.car_switch_requests
for insert
to anon
with check (true);

create policy "public update car switch requests"
on public.car_switch_requests
for update
to anon
using (true)
with check (true);

create policy "public delete car switch requests"
on public.car_switch_requests
for delete
to anon
using (true);
```

> Note: This is intentionally open for a simple family shared app with no auth.
