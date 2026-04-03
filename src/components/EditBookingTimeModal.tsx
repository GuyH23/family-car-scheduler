import { useEffect, useState } from 'react'
import type { Booking } from '../types'
import { splitDateTimeValue } from '../utils/bookingUtils'

type EditBookingTimeModalProps = {
  booking: Booking | null
  isOpen: boolean
  onCancel: () => void
  onSave: (startDateTime: string, endDateTime: string) => void
}

export default function EditBookingTimeModal({
  booking,
  isOpen,
  onCancel,
  onSave,
}: EditBookingTimeModalProps) {
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

  useEffect(() => {
    if (!booking || !isOpen) {
      return
    }

    const startParts = splitDateTimeValue(booking.startDateTime)
    const endParts = splitDateTimeValue(booking.endDateTime)

    setDate(startParts.date)
    setStartTime(startParts.time)
    setEndTime(endParts.time)
  }, [booking, isOpen])

  if (!isOpen || !booking) {
    return null
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit booking time range">
      <div className="modal-card">
        <h3>Edit booking hours</h3>
        <p>Adjust start/end times for this booking.</p>
        <div className="edit-booking-modal-form">
          <label>
            Date
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            Start
            <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </label>
          <label>
            End
            <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="modal-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="modal-primary"
            onClick={() => onSave(`${date}T${startTime}:00`, `${date}T${endTime}:00`)}
            disabled={!date || !startTime || !endTime}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
