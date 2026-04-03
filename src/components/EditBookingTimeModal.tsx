import { useEffect, useState } from 'react'
import type { Booking } from '../types'
import { splitDateTimeValue } from '../utils/bookingUtils'

type EditBookingTimeModalProps = {
  booking: Booking | null
  isOpen: boolean
  onCancel: () => void
  onSave: (title: string, startDateTime: string, endDateTime: string) => void
}

export default function EditBookingTimeModal({
  booking,
  isOpen,
  onCancel,
  onSave,
}: EditBookingTimeModalProps) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

  useEffect(() => {
    if (!booking || !isOpen) {
      return
    }

    const startParts = splitDateTimeValue(booking.startDateTime)
    const endParts = splitDateTimeValue(booking.endDateTime)

    setTitle(booking.title ?? '')
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
        <h3>Edit booking</h3>
        <p>Update title and time range for this booking.</p>
        <div className="edit-booking-modal-form">
          <label>
            Title
            <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
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
            onClick={() => onSave(title, `${date}T${startTime}:00`, `${date}T${endTime}:00`)}
            disabled={!date || !startTime || !endTime}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
