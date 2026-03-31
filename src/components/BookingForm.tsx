import type { FormEvent } from 'react'
import type { Booking, FamilyMember, RequestedCarOption } from '../types'
import { REQUESTED_CAR_OPTIONS } from '../types'

type BookingFormValues = {
  title: string
  requestedCarOption: RequestedCarOption
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  isUrgent: boolean
  note: string
}

type BookingFormProps = {
  values: BookingFormValues
  currentUser: FamilyMember
  conflicts: Booking[]
  selfConflicts: Booking[]
  isValidRange: boolean
  noCarAvailable: boolean
  isParent: boolean
  canSubmit: boolean
  statusMessage: string
  onFieldChange: <K extends keyof BookingFormValues>(key: K, value: BookingFormValues[K]) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export default function BookingForm({
  values,
  currentUser,
  conflicts,
  selfConflicts,
  isValidRange,
  noCarAvailable,
  isParent,
  canSubmit,
  statusMessage,
  onFieldChange,
  onSubmit,
}: BookingFormProps) {
  const ownConflictCount = selfConflicts.length
  const otherConflictCount = conflicts.length - ownConflictCount

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
          Start
          <span className="date-time-row">
            <input
              type="date"
              value={values.startDate}
              onChange={(event) => onFieldChange('startDate', event.target.value)}
            />
            <input
              type="time"
              value={values.startTime}
              onChange={(event) => onFieldChange('startTime', event.target.value)}
            />
          </span>
        </label>

        <label>
          End
          <span className="date-time-row">
            <input
              type="date"
              value={values.endDate}
              onChange={(event) => onFieldChange('endDate', event.target.value)}
            />
            <input
              type="time"
              value={values.endTime}
              onChange={(event) => onFieldChange('endTime', event.target.value)}
            />
          </span>
        </label>

        <label>
          Note (optional)
          <textarea
            rows={3}
            placeholder="Anything important for this booking..."
            value={values.note}
            onChange={(event) => onFieldChange('note', event.target.value)}
          />
        </label>

        <label className="urgent-toggle">
          <input
            type="checkbox"
            checked={values.isUrgent}
            disabled={!isParent}
            onChange={(event) => onFieldChange('isUrgent', event.target.checked)}
          />
          Urgent (Mom and Dad only)
        </label>

        <div className={`availability ${isValidRange && conflicts.length === 0 && !noCarAvailable ? 'available' : 'busy'}`}>
          {!isValidRange && <p>End time must be after start time.</p>}
          {isValidRange && noCarAvailable && <p>No car is available for automatic assignment in this range.</p>}
          {isValidRange && !noCarAvailable && conflicts.length === 0 && <p>Car is available for this time range.</p>}
          {isValidRange && ownConflictCount > 0 && otherConflictCount === 0 && (
            <p>
              You already have {ownConflictCount} booking(s) in this range. Urgent cannot override your own bookings.
            </p>
          )}
          {isValidRange && ownConflictCount === 0 && otherConflictCount > 0 && (
            <p>
              Overlaps with {otherConflictCount} active booking(s).
              {isParent ? ' Use urgent to override.' : ' Choose another time.'}
            </p>
          )}
          {isValidRange && ownConflictCount > 0 && otherConflictCount > 0 && (
            <p>
              Overlaps with your own booking(s) ({ownConflictCount}) and other booking(s) ({otherConflictCount}).
              {isParent
                ? ' Urgent can override other users bookings, but not your own.'
                : ' Please choose another time or delete your own conflicting booking first.'}
            </p>
          )}
        </div>

        <button type="submit" disabled={!canSubmit}>
          Save booking
        </button>
      </form>

      {statusMessage && <p className="status-message">{statusMessage}</p>}
    </section>
  )
}
