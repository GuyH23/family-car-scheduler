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
}

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
  const showBusyDetails = isValidRange && (ownConflictCount > 0 || otherConflictCount > 0 || noCarAvailable || bothCarsUnavailableForRequest || hasPartialNoPreferenceAvailability)
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
  const hasDirectConflictMessage =
    (isValidRange && values.requestedCarOption === 'red' && !redAvailable && Boolean(redOwner)) ||
    (isValidRange && values.requestedCarOption === 'white' && !whiteAvailable && Boolean(whiteOwner)) ||
    (isValidRange && values.requestedCarOption === 'bothCars' && freeCarCount === 1)
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
          Date & time range
          <span className="booking-date-time-row">
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
          </span>
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
          {isValidRange && !showUrgentOverrideSummary && values.requestedCarOption === 'noPreference' && !hasPartialNoPreferenceAvailability && !noCarAvailable && !whiteAvailable && whiteOwner && (
            <p>White car is booked by {whiteOwner}.</p>
          )}
          {isValidRange && !showUrgentOverrideSummary && values.requestedCarOption === 'noPreference' && !hasPartialNoPreferenceAvailability && !noCarAvailable && !redAvailable && redOwner && (
            <p>Red car is booked by {redOwner}.</p>
          )}
          {isValidRange && !showUrgentOverrideSummary && bothCarsUnavailableForRequest && (
            <p>Both cars are required, but fewer than 2 cars are available in this time range.</p>
          )}
          {isValidRange && !showUrgentOverrideSummary && noCarAvailable && whiteOwner && redOwner && (
            <p>Both cars are already occupied in this time range: White by {whiteOwner}, Red by {redOwner}.</p>
          )}
          {isValidRange && !showUrgentOverrideSummary && noCarAvailable && (!whiteOwner || !redOwner) && <p>Both cars are already occupied in this time range.</p>}
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
          {showBusyDetails && !showUrgentOverrideSummary && !hasDirectConflictMessage && conflictDetails.length > 0 && (
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
