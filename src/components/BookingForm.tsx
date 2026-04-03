import { useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import type { Booking, FamilyMember, RequestedCarOption } from '../types'
import { REQUESTED_CAR_OPTIONS } from '../types'

type BookingFormValues = {
  title: string
  requestedCarOption: RequestedCarOption
  bookingDate: string
  startTime: string
  endTime: string
  isUrgent: boolean
  isRecurring: boolean
  recurringWeekdays: number[]
}

const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
]

type BookingFormProps = {
  values: BookingFormValues
  currentUser: FamilyMember
  conflicts: Booking[]
  selfConflicts: Booking[]
  whiteConflicts: Booking[]
  redConflicts: Booking[]
  isValidRange: boolean
  noCarAvailable: boolean
  isParent: boolean
  canSubmit: boolean
  whiteAvailable: boolean
  redAvailable: boolean
  onFieldChange: <K extends keyof BookingFormValues>(key: K, value: BookingFormValues[K]) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export default function BookingForm({
  values,
  currentUser,
  conflicts,
  selfConflicts,
  whiteConflicts,
  redConflicts,
  isValidRange,
  noCarAvailable,
  isParent,
  canSubmit,
  whiteAvailable,
  redAvailable,
  onFieldChange,
  onSubmit,
}: BookingFormProps) {
  const previousCustomRangeRef = useRef<{ startTime: string; endTime: string } | null>(null)
  const isAllDaySelected = values.startTime === '00:00' && values.endTime === '23:59'
  const toggleAllDay = () => {
    if (isAllDaySelected) {
      const fallbackRange = previousCustomRangeRef.current ?? { startTime: '09:00', endTime: '10:00' }
      onFieldChange('startTime', fallbackRange.startTime)
      onFieldChange('endTime', fallbackRange.endTime)
      return
    }

    previousCustomRangeRef.current = {
      startTime: values.startTime,
      endTime: values.endTime,
    }
    onFieldChange('startTime', '00:00')
    onFieldChange('endTime', '23:59')
  }

  useEffect(() => {
    if (!isAllDaySelected) {
      previousCustomRangeRef.current = {
        startTime: values.startTime,
        endTime: values.endTime,
      }
    }
  }, [isAllDaySelected, values.endTime, values.startTime])

  const ownConflictCount = selfConflicts.length
  const otherConflictCount = conflicts.length - ownConflictCount
  const freeCarCount = Number(whiteAvailable) + Number(redAvailable)
  const hasPartialNoPreferenceAvailability = values.requestedCarOption === 'noPreference' && freeCarCount === 1
  const shouldShowAvailable = isValidRange &&
    ownConflictCount === 0 &&
    !noCarAvailable &&
    !hasPartialNoPreferenceAvailability &&
    (
      (values.requestedCarOption === 'noPreference' && freeCarCount === 2) ||
      (values.requestedCarOption !== 'noPreference' && otherConflictCount === 0)
    )
  const onlyWhiteAvailable = values.requestedCarOption === 'noPreference' && whiteAvailable && !redAvailable
  const onlyRedAvailable = values.requestedCarOption === 'noPreference' && !whiteAvailable && redAvailable
  const bothCarsUnavailableForRequest = values.requestedCarOption === 'bothCars' && freeCarCount < 2
  const whiteConflict = whiteConflicts[0]
  const redConflict = redConflicts[0]
  const ownerLabel = (owner: FamilyMember) => (owner === currentUser ? 'you' : owner)
  const formatConflictOwner = (booking: Booking | undefined) => {
    if (!booking) {
      return ''
    }
    const displayOwner = ownerLabel(booking.user)
    const cleanTitle = (booking.title ?? '').trim()
    return cleanTitle ? `${displayOwner} (${cleanTitle})` : displayOwner
  }
  const whiteOwner = formatConflictOwner(whiteConflict)
  const redOwner = formatConflictOwner(redConflict)
  const showUrgentOverrideSummary = isValidRange && values.isUrgent && ownConflictCount === 0 && otherConflictCount > 0
  const toggleRecurringWeekday = (weekday: number) => {
    const next = values.recurringWeekdays.includes(weekday)
      ? values.recurringWeekdays.filter((day) => day !== weekday)
      : [...values.recurringWeekdays, weekday].sort((a, b) => a - b)
    onFieldChange('recurringWeekdays', next)
  }
  const selectWorkWeek = () => {
    const workWeekDays = [0, 1, 2, 3, 4]
    const hasAllWorkDaysSelected = workWeekDays.every((day) => values.recurringWeekdays.includes(day))

    if (hasAllWorkDaysSelected) {
      onFieldChange(
        'recurringWeekdays',
        values.recurringWeekdays.filter((day) => !workWeekDays.includes(day)),
      )
      return
    }

    onFieldChange(
      'recurringWeekdays',
      [...new Set([...values.recurringWeekdays, ...workWeekDays])].sort((a, b) => a - b),
    )
  }
  const selectRuthSchedule = () => {
    const ruthDays = [0, 1, 2, 4, 5]
    const hasAllRuthDaysSelected = ruthDays.every((day) => values.recurringWeekdays.includes(day))

    if (hasAllRuthDaysSelected) {
      onFieldChange(
        'recurringWeekdays',
        values.recurringWeekdays.filter((day) => !ruthDays.includes(day)),
      )
      return
    }

    onFieldChange(
      'recurringWeekdays',
      [...new Set([...values.recurringWeekdays, ...ruthDays])].sort((a, b) => a - b),
    )
  }
  const recurringLabelWithDate = (weekday: number): string => {
    const baseLabel = WEEKDAY_OPTIONS.find((item) => item.value === weekday)?.label ?? ''
    const selectedDate = new Date(`${values.bookingDate}T00:00:00`)
    if (Number.isNaN(selectedDate.getTime())) {
      return baseLabel
    }

    const weekStart = new Date(selectedDate)
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())

    const weekdayDate = new Date(weekStart)
    weekdayDate.setDate(weekStart.getDate() + weekday)
    return `${baseLabel} ${weekdayDate.getDate()}.${weekdayDate.getMonth() + 1}`
  }

  return (
    <section className="panel">
      <h2>New booking</h2>
      <form className="booking-form" onSubmit={onSubmit}>
        <p className="booking-owner">
          Booking owner: <strong>{currentUser}</strong>
        </p>

        <label>
          Title / purpose (optional)
          <input
            type="text"
            placeholder="School pickup, work meeting..."
            value={values.title}
            onChange={(event) => onFieldChange('title', event.target.value)}
          />
        </label>

        <label>
          Car
          <select
            value={values.requestedCarOption}
            onChange={(event) => onFieldChange('requestedCarOption', event.target.value as RequestedCarOption)}
          >
            {REQUESTED_CAR_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Date & time range
          <span className={`booking-date-time-row ${values.isRecurring ? 'has-recurring-days' : ''}`}>
            <span className="booking-date-row">
              <input
                className="booking-date-input"
                type="date"
                value={values.bookingDate}
                onChange={(event) => onFieldChange('bookingDate', event.target.value)}
              />
            </span>
            <span className="booking-time-row">
              <span className="time-field time-field-start">
                <span className="time-field-label">Start</span>
                <input
                  type="time"
                  value={values.startTime}
                  onChange={(event) => onFieldChange('startTime', event.target.value)}
                />
              </span>
              <span className="time-field time-field-end">
                <span className="time-field-label">End</span>
                <input
                  type="time"
                  value={values.endTime}
                  onChange={(event) => onFieldChange('endTime', event.target.value)}
                />
              </span>
            </span>
            <span className="recurring-toggle-row">
              <label className="urgent-toggle recurring-toggle">
                <input
                  type="checkbox"
                  checked={values.isRecurring}
                  onChange={(event) => onFieldChange('isRecurring', event.target.checked)}
                />
                Recurring in this week
              </label>
            </span>
            {values.isRecurring && (
              <span className="recurring-days-row">
                <span className="recurring-days">
                  {WEEKDAY_OPTIONS.map((option) => (
                    <label key={option.value} className="recurring-day">
                      <input
                        type="checkbox"
                        checked={values.recurringWeekdays.includes(option.value)}
                        onChange={() => toggleRecurringWeekday(option.value)}
                      />
                      {recurringLabelWithDate(option.value)}
                    </label>
                  ))}
                  <button type="button" className="recurring-quick-select" onClick={selectWorkWeek}>
                    Sun-Thu
                  </button>
                  <button type="button" className="recurring-quick-select" onClick={selectRuthSchedule}>
                    Ruth
                  </button>
                </span>
              </span>
            )}
            <span className="all-day-button-row">
              <label className="urgent-toggle all-day-toggle">
                <input
                  type="checkbox"
                  checked={isAllDaySelected}
                  onChange={toggleAllDay}
                />
                All day
              </label>
            </span>
          </span>
        </label>

        {isParent && (
          <label className="urgent-toggle">
            <input
              type="checkbox"
              checked={values.isUrgent}
              onChange={(event) => onFieldChange('isUrgent', event.target.checked)}
            />
            Urgent (override another booking)
          </label>
        )}

        <div className={`availability ${shouldShowAvailable ? 'available' : hasPartialNoPreferenceAvailability ? 'partial' : 'busy'}`}>
          {!isValidRange && <p>End time must be after start time.</p>}
          {shouldShowAvailable && !onlyWhiteAvailable && !onlyRedAvailable && <p>Both cars are available for this time range.</p>}
          {shouldShowAvailable && onlyWhiteAvailable && <p>Only White is available in this time range.</p>}
          {shouldShowAvailable && onlyRedAvailable && <p>Only Red is available in this time range.</p>}
          {showUrgentOverrideSummary && whiteOwner && redOwner && (
            <p>Urgent will override bookings in this slot: White by {whiteOwner}, Red by {redOwner}.</p>
          )}
          {showUrgentOverrideSummary && whiteOwner && !redOwner && (
            <p>Urgent will override booking in this slot: White by {whiteOwner}.</p>
          )}
          {showUrgentOverrideSummary && redOwner && !whiteOwner && (
            <p>Urgent will override booking in this slot: Red by {redOwner}.</p>
          )}
          {hasPartialNoPreferenceAvailability && <p>Free car: {whiteAvailable ? 'White' : 'Red'}.</p>}
          {isValidRange && ownConflictCount === 0 && !showUrgentOverrideSummary && values.requestedCarOption === 'noPreference' && !hasPartialNoPreferenceAvailability && !noCarAvailable && !whiteAvailable && whiteOwner && (
            <p>White car is booked by {whiteOwner}.</p>
          )}
          {isValidRange && ownConflictCount === 0 && !showUrgentOverrideSummary && values.requestedCarOption === 'noPreference' && !hasPartialNoPreferenceAvailability && !noCarAvailable && !redAvailable && redOwner && (
            <p>Red car is booked by {redOwner}.</p>
          )}
          {isValidRange && ownConflictCount === 0 && !showUrgentOverrideSummary && bothCarsUnavailableForRequest && (
            <p>Both cars are required, but fewer than 2 cars are available in this time range.</p>
          )}
          {isValidRange && ownConflictCount === 0 && !showUrgentOverrideSummary && noCarAvailable && whiteOwner && redOwner && (
            <p>Both cars are already occupied in this time range: White by {whiteOwner}, Red by {redOwner}.</p>
          )}
          {isValidRange && ownConflictCount === 0 && !showUrgentOverrideSummary && noCarAvailable && (!whiteOwner || !redOwner) && <p>Both cars are already occupied in this time range.</p>}
          {isValidRange && ownConflictCount > 0 && otherConflictCount === 0 && (
            <p>
              This slot is not available for you because it overlaps your own booking(s).
              {values.isUrgent ? ' Urgent cannot override your own bookings.' : ''}
            </p>
          )}
          {isValidRange && !showUrgentOverrideSummary && ownConflictCount === 0 && otherConflictCount > 0 && values.requestedCarOption !== 'noPreference' && (
            <p>
              This slot is not available. Choose another time{isParent ? ' or use urgent for other-user conflicts.' : '.'}
            </p>
          )}
          {isValidRange && !showUrgentOverrideSummary && values.requestedCarOption === 'bothCars' && freeCarCount === 1 && whiteAvailable && redOwner && (
            <p>Both cars is not possible because Red is already booked by {redOwner}.</p>
          )}
          {isValidRange && !showUrgentOverrideSummary && values.requestedCarOption === 'bothCars' && freeCarCount === 1 && redAvailable && whiteOwner && (
            <p>Both cars is not possible because White is already booked by {whiteOwner}.</p>
          )}
          {isValidRange && !showUrgentOverrideSummary && values.requestedCarOption === 'red' && !redAvailable && redOwner && (
            <p>Red car is booked by {redOwner}.</p>
          )}
          {isValidRange && !showUrgentOverrideSummary && values.requestedCarOption === 'white' && !whiteAvailable && whiteOwner && (
            <p>White car is booked by {whiteOwner}.</p>
          )}
          {isValidRange && ownConflictCount > 0 && otherConflictCount > 0 && (
            <p>
              This slot overlaps your own booking(s) and other booking(s). Urgent can override other users, but not your own bookings.
            </p>
          )}
        </div>

        <button type="submit" disabled={!canSubmit}>
          {values.isRecurring ? 'Save recurring bookings' : 'Save booking'}
        </button>
      </form>
    </section>
  )
}
