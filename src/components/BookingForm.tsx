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
  isValidRange,
  noCarAvailable,
  isParent,
  canSubmit,
  whiteAvailable,
  redAvailable,
  onFieldChange,
  onSubmit,
}: BookingFormProps) {
  const ownConflictCount = selfConflicts.length
  const otherConflictCount = conflicts.length - ownConflictCount
  const freeCarCount = Number(whiteAvailable) + Number(redAvailable)
  const shouldShowAvailable = isValidRange && ownConflictCount === 0 && otherConflictCount === 0 && !noCarAvailable
  const onlyWhiteAvailable = values.requestedCarOption === 'noPreference' && whiteAvailable && !redAvailable
  const onlyRedAvailable = values.requestedCarOption === 'noPreference' && !whiteAvailable && redAvailable
  const bothCarsUnavailableForRequest = values.requestedCarOption === 'bothCars' && freeCarCount < 2
  const showBusyDetails = isValidRange && (ownConflictCount > 0 || otherConflictCount > 0 || noCarAvailable || bothCarsUnavailableForRequest)
  const whiteConflict = conflicts.find((booking) => booking.assignedCars.includes('white'))
  const redConflict = conflicts.find((booking) => booking.assignedCars.includes('red'))
  const formatConflictOwner = (booking: Booking | undefined) => {
    if (!booking) {
      return ''
    }
    const cleanTitle = (booking.title ?? '').trim()
    return cleanTitle ? `${booking.user} (${cleanTitle})` : booking.user
  }
  const whiteOwner = formatConflictOwner(whiteConflict)
  const redOwner = formatConflictOwner(redConflict)
  const conflictDetails = conflicts.flatMap((booking) =>
    booking.assignedCars.map((car) => {
      const carLabel = car === 'white' ? 'White' : 'Red'
      const cleanTitle = (booking.title ?? '').trim()
      const titleSuffix = cleanTitle ? ` (${cleanTitle})` : ''
      return {
        key: `${booking.id}-${car}`,
        message: `${carLabel} car is booked by ${booking.user}${titleSuffix}`,
      }
    }),
  )

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

        <div className={`availability ${shouldShowAvailable ? 'available' : 'busy'}`}>
          {!isValidRange && <p>End time must be after start time.</p>}
          {shouldShowAvailable && !onlyWhiteAvailable && !onlyRedAvailable && <p>Car is available for this time range.</p>}
          {shouldShowAvailable && onlyWhiteAvailable && <p>Only White is available in this time range.</p>}
          {shouldShowAvailable && onlyRedAvailable && <p>Only Red is available in this time range.</p>}
          {isValidRange && bothCarsUnavailableForRequest && (
            <p>Both cars are required, but fewer than 2 cars are available in this time range.</p>
          )}
          {isValidRange && noCarAvailable && <p>Both cars are already occupied in this time range.</p>}
          {isValidRange && ownConflictCount > 0 && otherConflictCount === 0 && (
            <p>
              This slot is not available for you because it overlaps your own booking(s). Urgent cannot override your own bookings.
            </p>
          )}
          {isValidRange && ownConflictCount === 0 && otherConflictCount > 0 && (
            <p>
              This slot is not available. Choose another time{isParent ? ' or use urgent for other-user conflicts.' : '.'}
            </p>
          )}
          {isValidRange && values.requestedCarOption === 'bothCars' && freeCarCount === 1 && whiteAvailable && redOwner && (
            <p>Both cars is not possible because Red is already booked by {redOwner}.</p>
          )}
          {isValidRange && values.requestedCarOption === 'bothCars' && freeCarCount === 1 && redAvailable && whiteOwner && (
            <p>Both cars is not possible because White is already booked by {whiteOwner}.</p>
          )}
          {isValidRange && values.requestedCarOption === 'red' && !redAvailable && redOwner && (
            <p>Red car is booked by {redOwner}.</p>
          )}
          {isValidRange && values.requestedCarOption === 'white' && !whiteAvailable && whiteOwner && (
            <p>White car is booked by {whiteOwner}.</p>
          )}
          {isValidRange && ownConflictCount > 0 && otherConflictCount > 0 && (
            <p>
              This slot overlaps your own booking(s) and other booking(s). Urgent can override other users, but not your own bookings.
            </p>
          )}
          {showBusyDetails && conflictDetails.length > 0 && (
            <ul className="availability-conflicts">
              {conflictDetails.map((detail) => (
                <li key={detail.key}>{detail.message}</li>
              ))}
            </ul>
          )}
        </div>

        <button type="submit" disabled={!canSubmit}>
          Save booking
        </button>
      </form>
    </section>
  )
}
