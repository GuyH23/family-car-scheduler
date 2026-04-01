import { FAMILY_MEMBERS } from '../types'
import type { Booking, CarFilter, CarId, FamilyMember, RequestedCarOption } from '../types'

type LegacyBooking = {
  id?: string
  user?: string
  car?: string
  requestedCarOption?: RequestedCarOption
  assignedCars?: CarId[]
  start?: string
  end?: string
  startDateTime?: string
  endDateTime?: string
  isUrgent?: boolean
  title?: string
  note?: string
  createdAt?: string
  status?: 'active' | 'overridden'
  overriddenByBookingId?: string
  notified?: boolean
}

export function overlaps(startA: string, endA: string, startB: string, endB: string): boolean {
  return new Date(startA).getTime() < new Date(endB).getTime() &&
    new Date(startB).getTime() < new Date(endA).getTime()
}

export function isValidDateRange(startDateTime: string, endDateTime: string): boolean {
  return new Date(startDateTime).getTime() < new Date(endDateTime).getTime()
}

function hasCarIntersection(a: CarId[], b: CarId[]): boolean {
  return a.some((car) => b.includes(car))
}

export function getConflicts(bookings: Booking[], assignedCars: CarId[], startDateTime: string, endDateTime: string): Booking[] {
  return bookings
    .filter((booking) => booking.status === 'active')
    .filter((booking) => hasCarIntersection(booking.assignedCars, assignedCars))
    .filter((booking) => overlaps(startDateTime, endDateTime, booking.startDateTime, booking.endDateTime))
    .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime())
}

export function filterBookingsByCar(bookings: Booking[], filter: CarFilter): Booking[] {
  const filtered = filter === 'both'
    ? bookings
    : bookings.filter((booking) => booking.assignedCars.includes(filter))
  return [...filtered].sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime())
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function toInputDateTimeValue(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  localDate.setSeconds(0, 0)
  return localDate.toISOString().slice(0, 16)
}

export function splitDateTimeValue(value: string): { date: string; time: string } {
  const [date, timePart] = value.split('T')
  const time = timePart ? timePart.slice(0, 5) : ''
  return { date: date ?? '', time }
}

export function combineDateAndTime(date: string, time: string): string {
  if (!date || !time) {
    return ''
  }

  return `${date}T${time}`
}

export function getWeekStart(date: Date): Date {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  normalized.setDate(normalized.getDate() - normalized.getDay())
  return normalized
}

export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart)
    day.setDate(weekStart.getDate() + index)
    return day
  })
}

export function bookingTouchesDay(booking: Booking, day: Date): boolean {
  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(day)
  dayEnd.setHours(23, 59, 59, 999)

  return overlaps(
    booking.startDateTime,
    booking.endDateTime,
    dayStart.toISOString(),
    dayEnd.toISOString(),
  )
}

export function parseStoredBookings(raw: string | null): Booking[] {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as LegacyBooking[]
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.flatMap((item): Booking[] => {
      const startDateTime = item.startDateTime ?? item.start
      const endDateTime = item.endDateTime ?? item.end

      if (!item.user || !item.car || !startDateTime || !endDateTime) {
        return []
      }

      const isKnownUser = FAMILY_MEMBERS.includes(item.user as FamilyMember)
      const isKnownCar = item.car === 'white' || item.car === 'red'

      if (!isKnownUser) {
        return []
      }

      const requestedCarOption = item.requestedCarOption
        ?? (isKnownCar ? item.car as RequestedCarOption : undefined)
        ?? 'white'

      const assignedCars = Array.isArray(item.assignedCars) && item.assignedCars.length > 0
        ? item.assignedCars.filter((car): car is CarId => car === 'white' || car === 'red')
        : (isKnownCar ? [item.car as CarId] : [])

      if (assignedCars.length === 0) {
        return []
      }

      return [{
        id: item.id ?? crypto.randomUUID(),
        title: item.title ?? '',
        user: item.user as Booking['user'],
        requestedCarOption,
        assignedCars,
        startDateTime,
        endDateTime,
        isUrgent: Boolean(item.isUrgent),
        note: item.note ?? '',
        status: item.status ?? 'active',
        overriddenByBookingId: item.overriddenByBookingId,
        notified: Boolean(item.notified),
        createdAt: item.createdAt ?? new Date().toISOString(),
      }]
    })
  } catch {
    return []
  }
}

export function preferredCarForUser(user: FamilyMember): CarId {
  return user === 'Mom' ? 'red' : 'white'
}

export function labelForAssignedCars(assignedCars: CarId[]): string {
  if (assignedCars.includes('white') && assignedCars.includes('red')) {
    return 'Both cars'
  }

  return assignedCars[0] === 'red' ? 'Red' : 'White'
}

export function carVisualClass(assignedCars: CarId[]): 'car-white' | 'car-red' | 'car-both' {
  if (assignedCars.includes('white') && assignedCars.includes('red')) {
    return 'car-both'
  }

  return assignedCars[0] === 'red' ? 'car-red' : 'car-white'
}
