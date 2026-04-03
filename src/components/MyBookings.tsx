import type { Booking, CarSwitchRequest, FamilyMember } from '../types'
import { carVisualClass, formatTime, labelForAssignedCars } from '../utils/bookingUtils'

type MyBookingsProps = {
  currentUser: FamilyMember
  bookings: Booking[]
  switchRequests: CarSwitchRequest[]
  onDeleteBooking: (bookingId: string) => void
  onEditBooking: (booking: Booking) => void
}

function statusLabel(status: CarSwitchRequest['status']): string {
  if (status === 'applied') {
    return 'Applied'
  }
  if (status === 'declined') {
    return 'Declined'
  }
  if (status === 'cancelled') {
    return 'Cancelled'
  }
  if (status === 'expired') {
    return 'Expired'
  }
  return 'Pending'
}

export default function MyBookings({ currentUser, bookings, switchRequests, onDeleteBooking, onEditBooking }: MyBookingsProps) {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const nowMs = Date.now()

  const myBookings = bookings
    .filter((booking) => booking.user === currentUser)
    .filter((booking) => new Date(booking.endDateTime).getTime() >= startOfToday.getTime())
    .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime())

  const groupedByDate = myBookings.reduce<Record<string, Booking[]>>((groups, booking) => {
    const dateKey = new Date(booking.startDateTime).toLocaleDateString('en-CA')
    if (!groups[dateKey]) {
      groups[dateKey] = []
    }
    groups[dateKey].push(booking)
    return groups
  }, {})

  const relevantFutureSwitchRequests = switchRequests
    .filter((request) => request.requesterName === currentUser || request.requestedUserName === currentUser)
    .filter((request) => new Date(request.requesterStartDateTime).getTime() > nowMs)
    .sort((a, b) => new Date(a.requesterStartDateTime).getTime() - new Date(b.requesterStartDateTime).getTime())
  const pendingSwitchRequests = relevantFutureSwitchRequests
    .filter((request) => request.status === 'pending')
    .slice(0, 8)
  const switchRequestHistory = relevantFutureSwitchRequests
    .filter((request) => request.status !== 'pending')
    .slice(0, 8)

  const renderSwitchRequestList = (items: CarSwitchRequest[]) => (
    <ul className="my-bookings-list">
      {items.map((request) => {
        const isRequester = request.requesterName === currentUser
        const title = (request.requesterTitle ?? '').trim()
        return (
          <li key={request.id} className="my-booking-item">
            <div className="my-booking-main">
              <strong>{isRequester ? `To ${request.requestedUserName}` : `From ${request.requesterName}`}</strong>
              <span className={`tag ${request.status === 'applied' ? 'active' : 'overridden'}`}>
                {statusLabel(request.status)}
              </span>
            </div>
            {title.length > 0 && <p>Reason: {title}</p>}
            <p>
              {new Date(request.requesterStartDateTime).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}{' '}
              {formatTime(request.requesterStartDateTime)} - {formatTime(request.requesterEndDateTime)}
            </p>
            <p>
              {request.requestedCurrentCar} to {request.requestedTargetCar}
            </p>
          </li>
        )
      })}
    </ul>
  )

  return (
    <section className="panel panel--my-bookings">
      <h2>My bookings</h2>

      {pendingSwitchRequests.length > 0 && (
        <section className="my-switch-requests">
          <h3 className="my-booking-date">Pending switch requests</h3>
          {renderSwitchRequestList(pendingSwitchRequests)}
        </section>
      )}

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
                        <div className="my-booking-actions">
                          {booking.status === 'active' && (
                            <button
                              type="button"
                              className="small-edit-btn"
                              onClick={() => onEditBooking(booking)}
                            >
                              Edit
                            </button>
                          )}
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

      {switchRequestHistory.length > 0 && (
        <section className="my-switch-requests my-switch-requests--after-bookings">
          <h3 className="my-booking-date">Switch requests</h3>
          {renderSwitchRequestList(switchRequestHistory)}
        </section>
      )}
    </section>
  )
}
