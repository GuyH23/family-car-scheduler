import type { Booking, FamilyMember } from '../types'
import { carVisualClass, formatTime, labelForAssignedCars } from '../utils/bookingUtils'

type MyBookingsProps = {
  currentUser: FamilyMember
  bookings: Booking[]
  onDeleteBooking: (bookingId: string) => void
}

export default function MyBookings({ currentUser, bookings, onDeleteBooking }: MyBookingsProps) {
  const myBookings = bookings
    .filter((booking) => booking.user === currentUser)
    .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime())

  const groupedByDate = myBookings.reduce<Record<string, Booking[]>>((groups, booking) => {
    const dateKey = new Date(booking.startDateTime).toLocaleDateString('en-CA')
    if (!groups[dateKey]) {
      groups[dateKey] = []
    }
    groups[dateKey].push(booking)
    return groups
  }, {})

  return (
    <section className="panel panel--my-bookings">
      <h2>My bookings</h2>
      {myBookings.length === 0 && <p>No bookings yet.</p>}

      {myBookings.length > 0 && (
        <div className="my-booking-groups">
          {Object.entries(groupedByDate).map(([dateKey, dayBookings]) => {
            const dateTitle = new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })

            return (
              <section key={dateKey} className="my-booking-group">
                <h3 className="my-booking-date">{dateTitle}</h3>
                <ul className="my-bookings-list">
                  {dayBookings.map((booking) => (
                    <li
                      key={booking.id}
                      className={`my-booking-item ${carVisualClass(booking.assignedCars)} ${booking.isUrgent ? 'urgent' : ''} ${booking.status === 'overridden' ? 'overridden' : ''}`}
                    >
                      <div className="my-booking-main">
                        <strong>{booking.title?.trim() || 'Untitled booking'}</strong>
                        <button
                          type="button"
                          className="small-delete-btn"
                          onClick={() => {
                            if (window.confirm('Delete this booking?')) {
                              onDeleteBooking(booking.id)
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                      <p>
                        {formatTime(booking.startDateTime)} - {formatTime(booking.endDateTime)}
                      </p>
                      <p>Car: {labelForAssignedCars(booking.assignedCars)}</p>
                      <div className="tags">
                        <span className={`tag ${booking.status === 'overridden' ? 'overridden' : 'active'}`}>
                          {booking.status === 'overridden' ? 'Overridden' : 'Active'}
                        </span>
                        {booking.isUrgent && <span className="tag urgent">Urgent</span>}
                        {booking.assignedCars.length > 1 && <span className="tag both-cars">Both cars</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}
