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

## Team habits

- Update `CHANGELOG.md` for every meaningful user-facing or logic change.
- Keep this README workflow section aligned with real app behavior.
