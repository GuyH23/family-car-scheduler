import { useEffect, useMemo, useState } from 'react'
import type { Booking, CarFilter, FamilyMember } from '../types'
import {
  carVisualClass,
  filterBookingsByCar,
  formatDateTime,
  formatTime,
  getWeekDays,
  getWeekStart,
  labelForAssignedCars,
} from '../utils/bookingUtils'

type WeeklyCalendarProps = {
  bookings: Booking[]
  carFilter: CarFilter
  currentUser: FamilyMember
  onFilterChange: (value: CarFilter) => void
  onDeleteBooking: (bookingId: string) => void
}

type DaySegment = {
  booking: Booking
  startMinute: number
  endMinute: number
}

type PositionedSegment = DaySegment & {
  columnIndex: number
  columnCount: number
}

const HOURS_IN_DAY = 24
const MINUTES_IN_DAY = 24 * 60
const HOUR_HEIGHT = 64
const GRID_HEIGHT = HOURS_IN_DAY * HOUR_HEIGHT
const DEFAULT_SCROLL_MINUTE = 9 * 60

function minutesSinceDayStart(dateValue: string, dayStart: Date): number {
  const date = new Date(dateValue)
  return (date.getTime() - dayStart.getTime()) / 60000
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function segmentForDay(booking: Booking, day: Date): DaySegment | null {
  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const nextDay = new Date(dayStart)
  nextDay.setDate(nextDay.getDate() + 1)

  const bookingStart = new Date(booking.startDateTime)
  const bookingEnd = new Date(booking.endDateTime)

  if (bookingEnd <= dayStart || bookingStart >= nextDay) {
    return null
  }

  const segmentStart = bookingStart > dayStart ? bookingStart : dayStart
  const segmentEnd = bookingEnd < nextDay ? bookingEnd : nextDay

  const startMinute = clamp(minutesSinceDayStart(segmentStart.toISOString(), dayStart), 0, MINUTES_IN_DAY)
  const endMinute = clamp(minutesSinceDayStart(segmentEnd.toISOString(), dayStart), 0, MINUTES_IN_DAY)

  return {
    booking,
    startMinute,
    endMinute: Math.max(startMinute + 10, endMinute),
  }
}

function overlapsInMinutes(a: DaySegment, b: DaySegment): boolean {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute
}

function positionOverlappingSegments(segments: DaySegment[]): PositionedSegment[] {
  const sorted = [...segments].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute)

  const placements = new Map<DaySegment, { columnIndex: number; clusterId: number }>()
  const clusterMembers = new Map<number, DaySegment[]>()
  const clusterMaxColumn = new Map<number, number>()

  let clusterId = 0
  let active: Array<{ segment: DaySegment; columnIndex: number }> = []

  for (const segment of sorted) {
    active = active.filter((entry) => entry.segment.endMinute > segment.startMinute)

    if (active.length === 0 && placements.size > 0) {
      clusterId += 1
    }

    const usedColumns = new Set(active.map((entry) => entry.columnIndex))
    let columnIndex = 0
    while (usedColumns.has(columnIndex)) {
      columnIndex += 1
    }

    placements.set(segment, { columnIndex, clusterId })
    clusterMembers.set(clusterId, [...(clusterMembers.get(clusterId) ?? []), segment])
    clusterMaxColumn.set(clusterId, Math.max(clusterMaxColumn.get(clusterId) ?? 0, columnIndex + 1))

    active.push({ segment, columnIndex })
  }

  return sorted.map((segment) => {
    const placement = placements.get(segment)
    if (!placement) {
      return { ...segment, columnIndex: 0, columnCount: 1 }
    }

    const clusterSegments = clusterMembers.get(placement.clusterId) ?? []
    const sameMomentOverlapCount = Math.max(
      1,
      clusterSegments.filter((candidate) => overlapsInMinutes(candidate, segment)).length,
    )
    const columnCount = Math.max(clusterMaxColumn.get(placement.clusterId) ?? 1, sameMomentOverlapCount)

    return {
      ...segment,
      columnIndex: placement.columnIndex,
      columnCount,
    }
  })
}

export default function WeeklyCalendar({
  bookings,
  carFilter,
  currentUser,
  onFilterChange,
  onDeleteBooking,
}: WeeklyCalendarProps) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null)

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const filteredBookings = useMemo(() => filterBookingsByCar(bookings, carFilter), [bookings, carFilter])

  useEffect(() => {
    if (!scrollContainer) {
      return
    }

    scrollContainer.scrollTop = (DEFAULT_SCROLL_MINUTE / 60) * HOUR_HEIGHT - HOUR_HEIGHT
  }, [scrollContainer, weekStart])

  const positionedByDay = useMemo(() => {
    return weekDays.map((day) => {
      const segments = filteredBookings
        .map((booking) => segmentForDay(booking, day))
        .filter((segment): segment is DaySegment => segment !== null)
      return positionOverlappingSegments(segments)
    })
  }, [filteredBookings, weekDays])

  const weekTitle = `${weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${
    weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }`

  return (
    <section className="panel">
      <div className="week-header">
        <h2>Weekly calendar</h2>
        <label>
          Car filter
          <select value={carFilter} onChange={(event) => onFilterChange(event.target.value as CarFilter)}>
            <option value="both">Both cars</option>
            <option value="white">White car</option>
            <option value="red">Red car</option>
          </select>
        </label>
      </div>

      <div className="week-nav">
        <button type="button" onClick={() => setWeekStart((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7))}>
          Previous week
        </button>
        <strong>{weekTitle}</strong>
        <button type="button" onClick={() => setWeekStart((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7))}>
          Next week
        </button>
      </div>

      <div className="time-grid-shell">
        <div className="time-grid-header">
          <div className="time-axis-head"></div>
          <div className="day-headers">
            {weekDays.map((day) => (
              <div key={day.toISOString()} className="day-header">
                <strong>{day.toLocaleDateString(undefined, { weekday: 'short' })}</strong>
                <span>{day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="time-grid-scroll" ref={setScrollContainer}>
          <div className="time-grid-body">
            <div className="time-axis" style={{ height: `${GRID_HEIGHT}px` }}>
              {Array.from({ length: HOURS_IN_DAY + 1 }).map((_, hour) => (
                <span key={hour} style={{ top: `${hour * HOUR_HEIGHT}px` }}>
                  {hour === 24 ? '' : `${String(hour).padStart(2, '0')}:00`}
                </span>
              ))}
            </div>

            <div className="day-columns">
              {weekDays.map((day, dayIndex) => (
                <div key={day.toISOString()} className="day-column" style={{ height: `${GRID_HEIGHT}px` }}>
                  {Array.from({ length: HOURS_IN_DAY + 1 }).map((_, hour) => (
                    <div
                      key={hour}
                      className="hour-line"
                      style={{ top: `${hour * HOUR_HEIGHT}px` }}
                    ></div>
                  ))}

                  {positionedByDay[dayIndex].map((segment) => {
                    const duration = segment.endMinute - segment.startMinute
                    const top = (segment.startMinute / 60) * HOUR_HEIGHT
                    const height = (duration / 60) * HOUR_HEIGHT
                    const width = 100 / segment.columnCount
                    const left = segment.columnIndex * width
                    const booking = segment.booking

                    return (
                      <article
                        key={`${booking.id}-${dayIndex}`}
                        className={`grid-event ${carVisualClass(booking.assignedCars)} ${booking.status === 'overridden' ? 'overridden' : ''} ${booking.isUrgent ? 'urgent' : ''}`}
                        style={{
                          top: `${top}px`,
                          height: `${Math.max(18, height)}px`,
                          left: `calc(${left}% + 2px)`,
                          width: `calc(${width}% - 4px)`,
                        }}
                        title={`${booking.title?.trim() || 'Untitled booking'} | ${booking.user} | ${labelForAssignedCars(booking.assignedCars)} | ${formatDateTime(booking.startDateTime)} - ${formatDateTime(booking.endDateTime)}`}
                      >
                        <p className="event-title">{booking.title?.trim() || 'Untitled booking'}</p>
                        {height >= 40 && (
                          <p className="event-meta">
                            {booking.user} - {labelForAssignedCars(booking.assignedCars)}
                          </p>
                        )}
                        {height >= 54 && (
                          <p className="event-meta">
                            {formatTime(booking.startDateTime)} - {formatTime(booking.endDateTime)}
                          </p>
                        )}
                        {booking.user === currentUser && (
                          <button
                            type="button"
                            className="delete-event-btn"
                            aria-label={`Delete booking ${booking.title?.trim() || booking.user}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              const confirmed = window.confirm('Delete this booking?')
                              if (confirmed) {
                                onDeleteBooking(booking.id)
                              }
                            }}
                          >
                            Delete
                          </button>
                        )}
                        <div className="event-tags">
                          {booking.isUrgent && <span className="tag urgent">Urgent</span>}
                          {booking.assignedCars.length > 1 && <span className="tag both-cars">Both cars</span>}
                          {booking.status === 'overridden' && <span className="tag overridden">Overridden</span>}
                        </div>
                      </article>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
