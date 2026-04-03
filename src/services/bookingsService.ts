import { supabase } from '../lib/supabaseClient'
import type { Booking } from '../types'

type BookingRow = {
  id: string
  title: string | null
  user_name: Booking['user']
  requested_car_option: Booking['requestedCarOption']
  assigned_cars: Booking['assignedCars']
  start_datetime: string
  end_datetime: string
  is_urgent: boolean
  note: string | null
  status: Booking['status']
  overridden_by_booking_id: string | null
  notified: boolean
  google_event_id?: string | null
  calendar_sync_status?: 'pending' | 'synced' | 'failed' | null
  calendar_last_synced_at?: string | null
  calendar_sync_error?: string | null
  created_at: string
}

function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    title: row.title ?? '',
    user: row.user_name,
    requestedCarOption: row.requested_car_option,
    assignedCars: row.assigned_cars,
    startDateTime: row.start_datetime,
    endDateTime: row.end_datetime,
    isUrgent: row.is_urgent,
    note: row.note ?? '',
    status: row.status,
    overriddenByBookingId: row.overridden_by_booking_id ?? undefined,
    notified: row.notified,
    googleEventId: row.google_event_id ?? undefined,
    calendarSyncStatus: row.calendar_sync_status ?? undefined,
    calendarLastSyncedAt: row.calendar_last_synced_at ?? undefined,
    calendarSyncError: row.calendar_sync_error ?? undefined,
    createdAt: row.created_at,
  }
}

type BookingPatch = Partial<Pick<Booking, 'requestedCarOption' | 'assignedCars' | 'status' | 'notified'>> & {
  overriddenByBookingId?: string | null
}

function toPatch(patch: BookingPatch): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (patch.requestedCarOption !== undefined) {
    payload.requested_car_option = patch.requestedCarOption
  }
  if (patch.assignedCars !== undefined) {
    payload.assigned_cars = patch.assignedCars
  }
  if (patch.status !== undefined) {
    payload.status = patch.status
  }
  if (patch.overriddenByBookingId !== undefined) {
    payload.overridden_by_booking_id = patch.overriddenByBookingId
  }
  if (patch.notified !== undefined) {
    payload.notified = patch.notified
  }
  return payload
}

function patchNeedsCalendarResync(patch: BookingPatch): boolean {
  return patch.requestedCarOption !== undefined ||
    patch.assignedCars !== undefined ||
    patch.status !== undefined ||
    patch.overriddenByBookingId !== undefined
}

export async function listBookings(): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('start_datetime', { ascending: true })

  if (error) {
    throw error
  }

  return (data as BookingRow[]).map(toBooking)
}

export async function getBookingById(id: string): Promise<Booking | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return toBooking(data as BookingRow)
}

type CalendarSyncPayload = {
  action: 'upsert' | 'delete'
  bookingId: string
  booking?: Partial<Booking>
}

async function markCalendarSyncPending(bookingId: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({
      calendar_sync_status: 'pending',
      calendar_sync_error: null,
    })
    .eq('id', bookingId)

  if (error) {
    throw error
  }
}

async function syncBookingToCalendar(payload: CalendarSyncPayload): Promise<void> {
  const { data, error } = await supabase.functions.invoke('calendar-sync', {
    body: payload,
  })

  if (error) {
    throw error
  }

  const maybeResult = data as { success?: boolean; error?: string } | null
  if (maybeResult && maybeResult.success === false) {
    throw new Error(maybeResult.error ?? 'Calendar sync failed')
  }
}

async function syncBookingIdsToCalendar(bookingIds: string[]): Promise<void> {
  await Promise.all(bookingIds.map(async (bookingId) => {
    try {
      const booking = await getBookingById(bookingId)
      if (!booking) {
        return
      }

      await markCalendarSyncPending(bookingId)

      await syncBookingToCalendar({
        action: 'upsert',
        bookingId,
      })
    } catch (syncError) {
      console.error(`Calendar sync failed for booking ${bookingId}`, syncError)
    }
  }))
}

export async function createBooking(booking: Booking): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .insert({
      id: booking.id,
      title: booking.title ?? null,
      user_name: booking.user,
      requested_car_option: booking.requestedCarOption,
      assigned_cars: booking.assignedCars,
      start_datetime: booking.startDateTime,
      end_datetime: booking.endDateTime,
      is_urgent: booking.isUrgent,
      note: booking.note ?? null,
      status: booking.status,
      overridden_by_booking_id: booking.overriddenByBookingId ?? null,
      notified: booking.notified ?? false,
      created_at: booking.createdAt,
    })

  if (error) {
    throw error
  }
}

export type AttemptBookingInput = {
  bookingId: string
  title: string
  userName: Booking['user']
  requestedCarOption: Booking['requestedCarOption']
  startDateTime: string
  endDateTime: string
  isUrgent: boolean
  note: string
  confirmUrgentOverride?: boolean
  overrideBookingIds?: string[]
}

export type UrgentConflictCandidate = {
  id: string
  userName: Booking['user']
  title: string
  startDateTime: string
  endDateTime: string
  assignedCars: Booking['assignedCars']
}

export type AttemptBookingResult =
  | { decision: 'created'; message: string }
  | {
    decision: 'needs_urgent_confirmation'
    message: string
    affectedUserName: Booking['user']
    affectedStartDateTime: string
    affectedEndDateTime: string
    conflictingCars: Booking['assignedCars']
    conflictingBookings?: UrgentConflictCandidate[]
  }
  | {
    decision: 'created_with_override'
    message: string
    affectedUserName: Booking['user']
    affectedStartDateTime: string
    affectedEndDateTime: string
    overrideCount: number
  }
  | { decision: 'needs_both_cars_decision'; message: string; existingBookingId: string }
  | { decision: 'blocked'; message: string }

export async function attemptBooking(input: AttemptBookingInput): Promise<AttemptBookingResult> {
  const payload: Record<string, unknown> = {
    p_booking_id: input.bookingId,
    p_title: input.title || null,
    p_user_name: input.userName,
    p_requested_car_option: input.requestedCarOption,
    p_start_datetime: input.startDateTime,
    p_end_datetime: input.endDateTime,
    p_is_urgent: input.isUrgent,
    p_note: input.note || null,
    p_confirm_urgent_override: input.confirmUrgentOverride ?? false,
  }

  if (input.overrideBookingIds !== undefined) {
    payload.p_override_booking_ids = input.overrideBookingIds
  }

  const invokeAttemptBooking = async (rpcPayload: Record<string, unknown>) =>
    supabase.rpc('attempt_booking', rpcPayload)

  let { data, error } = await invokeAttemptBooking(payload)

  const message = error?.message ?? ''
  const missingOverrideArgInSchema = message.includes('Could not find the function public.attempt_booking') &&
    message.includes('p_override_booking_ids')

  if (error && missingOverrideArgInSchema) {
    const compatibilityPayload = { ...payload }
    delete compatibilityPayload.p_override_booking_ids
    const retryResult = await invokeAttemptBooking(compatibilityPayload)
    data = retryResult.data
    error = retryResult.error
  }

  if (error) {
    throw error
  }

  const result = data as AttemptBookingResult

  if (result.decision === 'created' || result.decision === 'created_with_override') {
    await syncBookingIdsToCalendar([input.bookingId])

    if (result.decision === 'created_with_override') {
      const { data: overriddenRows, error: overriddenRowsError } = await supabase
        .from('bookings')
        .select('id')
        .eq('overridden_by_booking_id', input.bookingId)

      if (overriddenRowsError) {
        console.error('Failed loading overridden bookings for calendar sync', overriddenRowsError)
      } else {
        const overriddenIds = (overriddenRows as Array<{ id: string }>).map((row) => row.id)
        if (overriddenIds.length > 0) {
          await syncBookingIdsToCalendar(overriddenIds)
        }
      }
    }
  }

  return result
}

export async function confirmBothCarsForExistingBooking(existingBookingId: string, userName: Booking['user']): Promise<void> {
  const { error } = await supabase.rpc('confirm_exact_time_both_cars', {
    p_booking_id: existingBookingId,
    p_user_name: userName,
  })

  if (error) {
    throw error
  }

  try {
    await markCalendarSyncPending(existingBookingId)
    await syncBookingToCalendar({
      action: 'upsert',
      bookingId: existingBookingId,
    })
  } catch (syncError) {
    console.error('Calendar sync failed after booking update', syncError)
  }
}

export async function updateBookingById(id: string, patch: BookingPatch): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update(toPatch(patch))
    .eq('id', id)

  if (error) {
    throw error
  }

  if (patchNeedsCalendarResync(patch)) {
    try {
      await markCalendarSyncPending(id)
      await syncBookingToCalendar({
        action: 'upsert',
        bookingId: id,
      })
    } catch (syncError) {
      console.error('Calendar sync failed after booking update', syncError)
    }
  }
}

export async function updateBookingsByIds(ids: string[], patch: BookingPatch): Promise<void> {
  if (ids.length === 0) {
    return
  }

  const { error } = await supabase
    .from('bookings')
    .update(toPatch(patch))
    .in('id', ids)

  if (error) {
    throw error
  }

  if (patchNeedsCalendarResync(patch)) {
    await syncBookingIdsToCalendar(ids)
  }
}

export async function updateBookingDetailsById(
  id: string,
  title: string,
  startDateTime: string,
  endDateTime: string,
): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({
      title: title || null,
      start_datetime: startDateTime,
      end_datetime: endDateTime,
    })
    .eq('id', id)

  if (error) {
    throw error
  }

  await syncBookingIdsToCalendar([id])
}

export async function deleteBookingById(id: string): Promise<void> {
  const booking = await getBookingById(id)

  if (!booking) {
    return
  }

  try {
    await markCalendarSyncPending(id)
    await syncBookingToCalendar({
      action: 'delete',
      bookingId: id,
      booking: {
        id: booking.id,
        googleEventId: booking.googleEventId,
        user: booking.user,
        assignedCars: booking.assignedCars,
        startDateTime: booking.startDateTime,
        endDateTime: booking.endDateTime,
        title: booking.title,
        note: booking.note,
      },
    })
  } catch (syncError) {
    // Deletion in Supabase must still succeed even if mirror sync fails.
    console.error('Calendar sync failed before booking deletion', syncError)
  }

  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id)

  if (error) {
    throw error
  }

  // If this booking overrode other bookings, restore them.
  const { data: overriddenRows, error: overriddenRowsError } = await supabase
    .from('bookings')
    .select('id')
    .eq('overridden_by_booking_id', id)
    .eq('status', 'overridden')

  if (overriddenRowsError) {
    throw overriddenRowsError
  }

  const overriddenIds = (overriddenRows as Array<{ id: string }>).map((row) => row.id)
  if (overriddenIds.length > 0) {
    await updateBookingsByIds(overriddenIds, {
      status: 'active',
      overriddenByBookingId: null,
    })
  }
}

export async function retryCalendarSyncForBooking(bookingId: string): Promise<void> {
  await syncBookingIdsToCalendar([bookingId])
}

export async function syncCalendarBacklog(bookings: Booking[]): Promise<void> {
  const candidates = bookings
    .filter((booking) => {
      if (booking.status === 'active') {
        return booking.calendarSyncStatus === 'pending' ||
          booking.calendarSyncStatus === 'failed' ||
          (booking.calendarSyncStatus === 'synced' && !booking.googleEventId) ||
          !booking.calendarSyncStatus
      }

      return booking.status === 'overridden' && (
        booking.calendarSyncStatus === 'pending' ||
        booking.calendarSyncStatus === 'failed' ||
        (booking.calendarSyncStatus === 'synced' && !booking.googleEventId) ||
        !booking.calendarSyncStatus
      )
    })
    .map((booking) => booking.id)

  if (candidates.length === 0) {
    return
  }

  await syncBookingIdsToCalendar(candidates)
}
