# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- Calendar `Agenda` sub-view with mobile-first list layout.
- Daily calendar `Jump to date` control.
- Availability snapshot section in Agenda view.
- Urgent override selection modal (choose conflicting booking before override).
- `README.md` project workflow documentation.
- `All day` booking toggle under the time inputs.
- Google Calendar backend sync function (`supabase/functions/calendar-sync`) for booking create/update/delete mirroring.
- Car-switch request flow with approval/decline, auto-expiry, and WhatsApp preset deep-link.
- Optional meantime booking reservation while waiting for switch approval.

### Changed
- Booking form simplified to single date + time range flow.
- Date/time layout refined for mobile fit and no overflow.
- Availability wording and conflict messaging simplified and clarified.
- Snapshot wording enhanced with interval-style availability messages.
- Snapshot wording now shortens to `X is available` when free for rest of day.
- Snapshot wording now omits `from 00:00` and uses `available until <time>` when availability starts at midnight.
- Urgent conflict panel simplified to non-redundant summary text.
- Owner wording now shows `you` for current user in conflict messages.
- Default calendar opening range adjusted to daytime.
- Urgent toggle now appears for parents only and label clarifies override behavior.
- `All day` control now uses the same checkbox-row format as `Urgent`.
- Auto-resolution ranking now prioritizes closer, higher-overlap alternatives and reduces weak options.
- Switch request message now uses in-app copy flow with reformatted text.

### Fixed
- Backend-authoritative booking flow for overlap and duplicate checks.
- Exact-time same-user detection bug where single-car could be misread as both cars.
- `bothCars` conflict safeguards to prevent impossible allocations.
- Pre-save vs post-submit mismatch in availability guidance.
- Redundant conflict text in booking form warning panel.
- RPC request compatibility issue causing `attempt_booking` 404 when DB signature lags.
- Blocked single-car flows can now surface exact-time switch proposals instead of only fallback times.
- Mobile compatibility issue where `crypto.randomUUID` was unavailable on some phones.

## [0.1.0] - 2026-03-31

### Added
- Initial family car scheduler app structure.
- Booking form, calendar views, my bookings view.
- Supabase integration for shared booking persistence.
