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
    createdAt: row.created_at,
  }
}

type BookingPatch = Partial<Pick<Booking, 'requestedCarOption' | 'assignedCars' | 'status' | 'overriddenByBookingId' | 'notified'>>

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
  const { data, error } = await supabase.rpc('attempt_booking', {
    p_booking_id: input.bookingId,
    p_title: input.title || null,
    p_user_name: input.userName,
    p_requested_car_option: input.requestedCarOption,
    p_start_datetime: input.startDateTime,
    p_end_datetime: input.endDateTime,
    p_is_urgent: input.isUrgent,
    p_note: input.note || null,
    p_confirm_urgent_override: input.confirmUrgentOverride ?? false,
    p_override_booking_ids: input.overrideBookingIds ?? null,
  })

  if (error) {
    throw error
  }

  return data as AttemptBookingResult
}

export async function confirmBothCarsForExistingBooking(existingBookingId: string, userName: Booking['user']): Promise<void> {
  const { error } = await supabase.rpc('confirm_exact_time_both_cars', {
    p_booking_id: existingBookingId,
    p_user_name: userName,
  })

  if (error) {
    throw error
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
}

export async function deleteBookingById(id: string): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id)

  if (error) {
    throw error
  }
}
