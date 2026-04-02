# Family Car Scheduler

Shared family car booking app built with React, TypeScript, Vite, and Supabase.

## What the app does

- Supports 4 users: Dad, Mom, Noa, Yuval.
- Supports 2 cars: White and Red.
- Booking options: White, Red, No preference, Both cars.
- Conflict prevention and urgent override flow.
- Calendar views: Agenda, Daily, Weekly.
- My Bookings view per current user.

## Tech stack

- React + TypeScript + Vite
- Supabase (`bookings` table + RPC functions)
- Local storage for current user and theme

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` in project root:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Run development server:

```bash
npm run dev
```

4. Build for production:

```bash
npm run build
```

## App workflow

1. Select current user (stored locally).
2. Create booking:
   - choose car option
   - choose date + time range
   - optionally mark urgent (Mom/Dad only)
3. Pre-save availability panel shows if slot is possible and who occupies conflicts.
4. On submit, booking decision is validated by Supabase RPC (`attempt_booking`) before insert.
5. If exact-time duplicate (same user, different car), app prompts `Both cars / Cancel`.
6. If urgent conflicts exist, app asks which booking to override, then confirms.
7. Calendar updates from shared Supabase data for all devices.

## Supabase notes

- Booking creation/validation is backend-authoritative via RPC.
- Keep SQL function definitions in sync with frontend payload shape.
- If RPC signature changes, run SQL updates and reload PostgREST schema.

## Google Calendar sync (shared mirror)

This app can mirror bookings into one shared Google Calendar (no invites, no attendee approval, no per-user login in app).

### Architecture

- Source of truth is still Supabase `bookings`.
- Frontend calls Supabase RPC/table operations as before.
- After booking create/update/delete, frontend invokes Supabase Edge Function `calendar-sync`.
- `calendar-sync` uses a Google service account (server-side only) to create/update/delete events in a shared calendar.
- Booking rows store sync metadata (`google_event_id`, `calendar_sync_status`, `calendar_last_synced_at`, `calendar_sync_error`) for observability and retry.

### Required env vars

Local (`supabase/functions` secrets):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_CALENDAR_ID` (shared calendar id)

Frontend (existing):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Sync event format

- Calendar: shared `Car Schedule` calendar
- Summary: `{User} - {Assigned car(s)}`
- Description includes:
  - booking title (if present)
  - booking note (if present)
  - `Created via Family Car Scheduler`
- Time range uses booking `start_datetime` / `end_datetime`.
- Stable mapping uses booking `google_event_id` plus `extendedProperties.private.booking_id`.

## Team habits

- Update `CHANGELOG.md` for every meaningful user-facing or logic change.
- Keep this README workflow section aligned with real app behavior.
