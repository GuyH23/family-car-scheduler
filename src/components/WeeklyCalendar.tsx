import { useEffect, useMemo, useState } from 'react'
import type { Booking, CarId, FamilyMember } from '../types'
import {
  carVisualClass,
  formatDateTime,
  formatTime,
  getWeekDays,
  getWeekStart,
  labelForAssignedCars,
} from '../utils/bookingUtils'

type WeeklyCalendarProps = {
  bookings: Booking[]
  currentUser: FamilyMember
  onDeleteBooking: (bookingId: string) => void
}
type CalendarSubView = 'agenda' | 'daily' | 'weekly'

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
const DEFAULT_SCROLL_MINUTE = 10 * 60

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function formatAvailabilitySegments(segments: string[]): string {
  if (segments.length === 0) {
    return ''
  }
  if (segments.length === 1) {
    return segments[0]
  }
  if (segments.length === 2) {
    return `${segments[0]}, and then ${segments[1]}`
  }
  return `${segments.slice(0, -1).join(', ')}, and then ${segments[segments.length - 1]}`
}

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
  currentUser,
  onDeleteBooking,
}: WeeklyCalendarProps) {
  const [subView, setSubView] = useState<CalendarSubView>('agenda')
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [dayDate, setDayDate] = useState(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  })
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null)

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const visibleDays = subView === 'daily' ? [dayDate] : weekDays

  useEffect(() => {
    if (!scrollContainer) {
      return
    }

    scrollContainer.scrollTop = (DEFAULT_SCROLL_MINUTE / 60) * HOUR_HEIGHT - HOUR_HEIGHT
  }, [dayDate, scrollContainer, subView, weekStart])

  const positionedByDay = useMemo(() => {
    return visibleDays.map((day) => {
      const segments = bookings
        .map((booking) => segmentForDay(booking, day))
        .filter((segment): segment is DaySegment => segment !== null)
      return positionOverlappingSegments(segments)
    })
  }, [bookings, visibleDays])

  const weekTitle = `${weekDays[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${
    weekDays[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }`
  const dayTitle = dayDate.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const columnsCount = visibleDays.length
  const gridMinWidth = 56 + columnsCount * 120
  const columnsTemplate = `repeat(${columnsCount}, minmax(110px, 1fr))`
  const agendaItems = useMemo(
    () =>
      bookings
        .filter((booking) => segmentForDay(booking, dayDate) !== null)
        .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime()),
    [bookings, dayDate],
  )
  const agendaGroups = useMemo(() => {
    const groups = new Map<string, Booking[]>()
    for (const booking of agendaItems) {
      const timeKey = formatTime(booking.startDateTime)
      groups.set(timeKey, [...(groups.get(timeKey) ?? []), booking])
    }
    return [...groups.entries()]
  }, [agendaItems])
  const availabilitySnapshot = useMemo(() => {
    const now = new Date()
    const dayStart = new Date(dayDate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)
    const isToday = isSameLocalDay(dayDate, now)
    const windowStart = isToday && now > dayStart ? now : dayStart

    const buildFreeRanges = (car: CarId): Array<{ start: Date; end: Date }> => {
      const busy = bookings
        .filter((booking) => booking.status === 'active' && booking.assignedCars.includes(car))
        .map((booking) => {
          const start = new Date(booking.startDateTime)
          const end = new Date(booking.endDateTime)
          const clippedStart = start > windowStart ? start : windowStart
          const clippedEnd = end < dayEnd ? end : dayEnd
          return { start: clippedStart, end: clippedEnd }
        })
        .filter((range) => range.end > range.start)
        .sort((a, b) => a.start.getTime() - b.start.getTime())

      const merged: Array<{ start: Date; end: Date }> = []
      for (const range of busy) {
        const last = merged[merged.length - 1]
        if (!last || range.start > last.end) {
          merged.push({ ...range })
          continue
        }
        if (range.end > last.end) {
          last.end = range.end
        }
      }

      const freeRanges: Array<{ start: Date; end: Date }> = []
      let cursor = new Date(windowStart)
      for (const busyRange of merged) {
        if (busyRange.start > cursor) {
          freeRanges.push({ start: new Date(cursor), end: new Date(busyRange.start) })
        }
        if (busyRange.end > cursor) {
          cursor = new Date(busyRange.end)
        }
      }
      if (cursor < dayEnd) {
        freeRanges.push({ start: new Date(cursor), end: new Date(dayEnd) })
      }
      return freeRanges
    }

    return { buildFreeRanges, windowStart, dayStart, dayEnd, isToday }
  }, [bookings, dayDate])
  const snapshotLabel = (car: CarId) => {
    const freeRanges = availabilitySnapshot.buildFreeRanges(car)
    const carLabel = car === 'white' ? 'White' : 'Red'
    if (freeRanges.length === 0) {
      return `${carLabel} is fully booked for the rest of the day`
    }
    if (
      freeRanges.length === 1 &&
      Math.abs(freeRanges[0].start.getTime() - availabilitySnapshot.windowStart.getTime()) < 60000 &&
      Math.abs(freeRanges[0].end.getTime() - availabilitySnapshot.dayEnd.getTime()) < 60000
    ) {
      return `${carLabel} is available`
    }

    const segments = freeRanges.map((range) => {
      const startsNow = availabilitySnapshot.isToday && Math.abs(range.start.getTime() - availabilitySnapshot.windowStart.getTime()) < 60000
      const startsAtDayStart = Math.abs(range.start.getTime() - availabilitySnapshot.dayStart.getTime()) < 60000
      const startLabel = startsNow
        ? 'from now'
        : startsAtDayStart
          ? ''
          : `from ${formatTime(range.start.toISOString())}`
      const endLabel = Math.abs(range.end.getTime() - availabilitySnapshot.dayEnd.getTime()) < 60000
        ? 'for the rest of the day'
        : `until ${formatTime(range.end.toISOString())}`
      return startLabel ? `${startLabel} ${endLabel}` : endLabel
    })

    return `${carLabel} is available ${formatAvailabilitySegments(segments)}`
  }

  return (
    <section className="panel panel--calendar">
      <div className="week-header">
        <h2>Calendar</h2>
        <div className="calendar-subtabs" role="tablist" aria-label="Calendar view mode">
          <button
            type="button"
            className={subView === 'agenda' ? 'active' : ''}
            onClick={() => setSubView('agenda')}
          >
            Agenda
          </button>
          <button
            type="button"
            className={subView === 'daily' ? 'active' : ''}
            onClick={() => setSubView('daily')}
          >
            Daily
          </button>
          <button
            type="button"
            className={subView === 'weekly' ? 'active' : ''}
            onClick={() => setSubView('weekly')}
          >
            Weekly
          </button>
        </div>
      </div>

      {(subView === 'daily' || subView === 'agenda') && (
        <div className="week-jump-row">
          <label className="week-nav-date-jump">
            Jump to date
            <input
              type="date"
              value={toDateInputValue(dayDate)}
              onChange={(event) => {
                const value = event.target.value
                if (!value) {
                  return
                }
                const nextDate = new Date(`${value}T00:00:00`)
                if (Number.isNaN(nextDate.getTime())) {
                  return
                }
                setDayDate(nextDate)
                setWeekStart(getWeekStart(nextDate))
              }}
            />
          </label>
        </div>
      )}

      <div className="week-nav">
        {subView === 'weekly' && (
          <>
            <button type="button" onClick={() => setWeekStart((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7))}>
              Previous week
            </button>
            <strong>{weekTitle}</strong>
            <button type="button" onClick={() => setWeekStart((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7))}>
              Next week
            </button>
          </>
        )}

        {(subView === 'daily' || subView === 'agenda') && (
          <>
            <button type="button" onClick={() => setDayDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1))}>
              Previous day
            </button>
            <strong>{dayTitle}</strong>
            <button type="button" onClick={() => setDayDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1))}>
              Next day
            </button>
          </>
        )}
      </div>

      {subView === 'agenda' && (
        <section className="agenda-view">
          <div className="agenda-snapshot">
            <h3>Availability snapshot</h3>
            <p>{snapshotLabel('white')}</p>
            <p>{snapshotLabel('red')}</p>
          </div>

          {agendaGroups.length === 0 && (
            <p className="agenda-empty">No bookings for this day.</p>
          )}

          {agendaGroups.length > 0 && (
            <div className="agenda-groups">
              {agendaGroups.map(([timeLabel, groupBookings]) => (
                <section key={timeLabel} className="agenda-group">
                  <ul>
                    {groupBookings.map((booking) => {
                      const cleanTitle = booking.title?.trim() ?? ''
                      return (
                        <li
                          key={booking.id}
                          className={`agenda-item ${carVisualClass(booking.assignedCars)} ${booking.status === 'overridden' ? 'overridden' : ''} ${booking.isUrgent ? 'urgent' : ''}`}
                        >
                          <div className="agenda-item-main">
                            <strong>{formatTime(booking.startDateTime)} - {formatTime(booking.endDateTime)}</strong>
                            {booking.user === currentUser && (
                              <button
                                type="button"
                                className="small-delete-btn"
                                onClick={() => {
                                  const confirmed = window.confirm('Delete this booking?')
                                  if (confirmed) {
                                    onDeleteBooking(booking.id)
                                  }
                                }}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                          <p>{booking.user} - {labelForAssignedCars(booking.assignedCars)}</p>
                          {cleanTitle && <p>{cleanTitle}</p>}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>
      )}

      {subView !== 'agenda' && (
        <div className="time-grid-shell" ref={setScrollContainer}>
        <div className="time-grid-header" style={{ minWidth: `${gridMinWidth}px` }}>
          <div className="time-axis-head"></div>
          <div className="day-headers" style={{ gridTemplateColumns: columnsTemplate }}>
            {visibleDays.map((day) => (
              <div key={day.toISOString()} className="day-header">
                <strong>{day.toLocaleDateString(undefined, { weekday: 'short' })}</strong>
                <span>{day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="time-grid-body" style={{ minWidth: `${gridMinWidth}px` }}>
          <div className="time-axis" style={{ height: `${GRID_HEIGHT}px` }}>
            {Array.from({ length: HOURS_IN_DAY + 1 }).map((_, hour) => (
              <span key={hour} style={{ top: `${hour * HOUR_HEIGHT}px` }}>
                {hour === 24 ? '' : `${String(hour).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>

          <div className="day-columns" style={{ gridTemplateColumns: columnsTemplate }}>
            {visibleDays.map((day, dayIndex) => (
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
                  const cleanTitle = booking.title?.trim() ?? ''
                  const tooltipParts = [
                    cleanTitle,
                    booking.user,
                    labelForAssignedCars(booking.assignedCars),
                    `${formatDateTime(booking.startDateTime)} - ${formatDateTime(booking.endDateTime)}`,
                  ].filter(Boolean)

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
                      title={tooltipParts.join(' | ')}
                    >
                      {cleanTitle && <p className="event-title">{cleanTitle}</p>}
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
      )}
    </section>
  )
}
