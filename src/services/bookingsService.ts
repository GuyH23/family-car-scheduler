import { supabase } from '../lib/supabaseClient'
import type { Booking, CarId, CarSwitchRequest, CarSwitchRequestStatus, FamilyMember, RequestedCarOption } from '../types'
import { generateUuid } from '../utils/idUtils'

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

type CarSwitchRequestRow = {
  id: string
  requester_name: FamilyMember
  requested_user_name: FamilyMember
  requester_booking_id: string
  requester_title: string | null
  requester_requested_car_option: RequestedCarOption
  requester_start_datetime: string
  requester_end_datetime: string
  requested_booking_id: string
  requested_current_car: CarId
  requested_target_car: CarId
  interim_booking_id?: string | null
  status: CarSwitchRequestStatus
  expires_at: string
  created_at: string
  updated_at: string
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

function toCarSwitchRequest(row: CarSwitchRequestRow): CarSwitchRequest {
  return {
    id: row.id,
    requesterName: row.requester_name,
    requestedUserName: row.requested_user_name,
    requesterBookingId: row.requester_booking_id,
    requesterTitle: row.requester_title ?? '',
    requesterRequestedCarOption: row.requester_requested_car_option,
    requesterStartDateTime: row.requester_start_datetime,
    requesterEndDateTime: row.requester_end_datetime,
    requestedBookingId: row.requested_booking_id,
    requestedCurrentCar: row.requested_current_car,
    requestedTargetCar: row.requested_target_car,
    interimBookingId: row.interim_booking_id ?? undefined,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

export async function restoreDeletedBookings(bookings: Booking[]): Promise<void> {
  if (bookings.length === 0) {
    return
  }

  const rows = bookings.map((booking) => ({
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
  }))

  const { error } = await supabase
    .from('bookings')
    .upsert(rows, { onConflict: 'id' })

  if (error) {
    throw error
  }

  await syncBookingIdsToCalendar(bookings.map((booking) => booking.id))
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

export type CreateCarSwitchRequestInput = {
  requesterName: FamilyMember
  requestedUserName: FamilyMember
  requesterBookingId: string
  requesterTitle: string
  requesterRequestedCarOption: RequestedCarOption
  requesterStartDateTime: string
  requesterEndDateTime: string
  requestedBookingId: string
  requestedCurrentCar: CarId
  requestedTargetCar: CarId
  interimBookingId?: string
  expiresAt: string
}

export async function listCarSwitchRequests(): Promise<CarSwitchRequest[]> {
  const { data, error } = await supabase
    .from('car_switch_requests')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data as CarSwitchRequestRow[]).map(toCarSwitchRequest)
}

export async function createCarSwitchRequest(input: CreateCarSwitchRequestInput): Promise<CarSwitchRequest> {
  const row = {
    id: generateUuid(),
    requester_name: input.requesterName,
    requested_user_name: input.requestedUserName,
    requester_booking_id: input.requesterBookingId,
    requester_title: input.requesterTitle || null,
    requester_requested_car_option: input.requesterRequestedCarOption,
    requester_start_datetime: input.requesterStartDateTime,
    requester_end_datetime: input.requesterEndDateTime,
    requested_booking_id: input.requestedBookingId,
    requested_current_car: input.requestedCurrentCar,
    requested_target_car: input.requestedTargetCar,
    interim_booking_id: input.interimBookingId ?? null,
    status: 'pending' as CarSwitchRequestStatus,
    expires_at: input.expiresAt,
  }

  const { data, error } = await supabase
    .from('car_switch_requests')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return toCarSwitchRequest(data as CarSwitchRequestRow)
}

export async function updateCarSwitchRequestStatus(id: string, status: CarSwitchRequestStatus): Promise<void> {
  const { error } = await supabase
    .from('car_switch_requests')
    .update({ status })
    .eq('id', id)

  if (error) {
    throw error
  }
}

export async function expireElapsedCarSwitchRequests(nowIso: string): Promise<void> {
  const { error } = await supabase
    .from('car_switch_requests')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lte('expires_at', nowIso)

  if (error) {
    throw error
  }
}

export async function approveAndApplyCarSwitchRequest(request: CarSwitchRequest): Promise<void> {
  const { data: latestRequestRow, error: latestRequestError } = await supabase
    .from('car_switch_requests')
    .select('*')
    .eq('id', request.id)
    .maybeSingle()

  if (latestRequestError) {
    throw latestRequestError
  }

  if (!latestRequestRow) {
    throw new Error('Request does not exist anymore.')
  }

  const latestRequest = toCarSwitchRequest(latestRequestRow as CarSwitchRequestRow)
  if (latestRequest.status !== 'pending') {
    throw new Error('Request is no longer pending.')
  }
  if (new Date().toISOString() >= latestRequest.expiresAt) {
    await updateCarSwitchRequestStatus(latestRequest.id, 'expired')
    throw new Error('Request has expired.')
  }

  const requestedBooking = await getBookingById(latestRequest.requestedBookingId)
  if (!requestedBooking || requestedBooking.status !== 'active') {
    await updateCarSwitchRequestStatus(latestRequest.id, 'cancelled')
    throw new Error('Requested booking is not available anymore.')
  }
  if (requestedBooking.user !== latestRequest.requestedUserName) {
    await updateCarSwitchRequestStatus(latestRequest.id, 'cancelled')
    throw new Error('Requested booking owner changed.')
  }
  if (requestedBooking.assignedCars.length !== 1 || requestedBooking.assignedCars[0] !== latestRequest.requestedCurrentCar) {
    await updateCarSwitchRequestStatus(latestRequest.id, 'cancelled')
    throw new Error('Requested booking car no longer matches the request.')
  }

  const { data: targetCarBlockingRows, error: blockingError } = await supabase
    .from('bookings')
    .select('id')
    .eq('status', 'active')
    .neq('id', latestRequest.requestedBookingId)
    .lt('start_datetime', requestedBooking.endDateTime)
    .gt('end_datetime', requestedBooking.startDateTime)
    .contains('assigned_cars', [latestRequest.requestedTargetCar])

  if (blockingError) {
    throw blockingError
  }
  if ((targetCarBlockingRows as Array<{ id: string }>).length > 0) {
    await updateCarSwitchRequestStatus(latestRequest.id, 'cancelled')
    throw new Error('Target car became unavailable for the requested user.')
  }

  const originalRequestedOption = requestedBooking.requestedCarOption
  let interimBackupBooking: Booking | null = null

  if (latestRequest.interimBookingId) {
    const interim = await getBookingById(latestRequest.interimBookingId)
    if (!interim || interim.status !== 'active' || interim.user !== latestRequest.requesterName) {
      await updateCarSwitchRequestStatus(latestRequest.id, 'cancelled')
      throw new Error('Requester removed the meantime booking. Switch request was cancelled.')
    }
    if (interim && interim.status === 'active' && interim.user === latestRequest.requesterName) {
      interimBackupBooking = interim
      await deleteBookingById(interim.id)
    }
  }

  const { error: updateRequestedBookingError } = await supabase
    .from('bookings')
    .update({
      requested_car_option: latestRequest.requestedTargetCar,
      assigned_cars: [latestRequest.requestedTargetCar],
    })
    .eq('id', latestRequest.requestedBookingId)

  if (updateRequestedBookingError) {
    throw updateRequestedBookingError
  }

  try {
    const bookingAttempt = await attemptBooking({
      bookingId: latestRequest.requesterBookingId,
      title: latestRequest.requesterTitle ?? '',
      userName: latestRequest.requesterName,
      requestedCarOption: latestRequest.requesterRequestedCarOption,
      startDateTime: latestRequest.requesterStartDateTime,
      endDateTime: latestRequest.requesterEndDateTime,
      isUrgent: false,
      note: '',
      confirmUrgentOverride: false,
    })

    if (bookingAttempt.decision !== 'created') {
      throw new Error(bookingAttempt.message || 'Could not apply switch request.')
    }

    await updateCarSwitchRequestStatus(latestRequest.id, 'applied')
    await syncBookingIdsToCalendar([latestRequest.requestedBookingId, latestRequest.requesterBookingId])
  } catch (error) {
    // Roll back requested booking if requester booking could not be created.
    await supabase
      .from('bookings')
      .update({
        requested_car_option: originalRequestedOption,
        assigned_cars: [latestRequest.requestedCurrentCar],
      })
      .eq('id', latestRequest.requestedBookingId)

    if (interimBackupBooking) {
      await createBooking(interimBackupBooking)
      await syncBookingIdsToCalendar([interimBackupBooking.id])
    }

    await updateCarSwitchRequestStatus(latestRequest.id, 'cancelled')
    throw error
  }
}
