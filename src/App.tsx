import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import BookingForm from './components/BookingForm'
import ConfirmModal from './components/ConfirmModal'
import MyBookings from './components/MyBookings'
import UrgentOverrideModal from './components/UrgentOverrideModal'
import ViewShell from './components/ViewShell'
import UserSelectionModal from './components/UserSelectionModal'
import WeeklyCalendar from './components/WeeklyCalendar'
import type { Booking, CarId, FamilyMember, RequestedCarOption } from './types'
import { FAMILY_MEMBERS, PARENTS } from './types'
import {
  combineDateAndTime,
  formatDateTime,
  formatTime,
  getConflicts,
  isValidDateRange,
  labelForAssignedCars,
  parseStoredBookings,
  preferredCarForUser,
  splitDateTimeValue,
  toInputDateTimeValue,
} from './utils/bookingUtils'
import './App.css'

const STORAGE_KEY = 'carScheduler.bookings.v1'
const CURRENT_USER_KEY = 'carScheduler.currentUser.v1'
const THEME_KEY = 'carScheduler.theme.v1'

type AppView = 'booking' | 'calendar' | 'myBookings'
type ThemeName = 'blue' | 'pink'
type BookingFormField = 'title' | 'requestedCarOption' | 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'isUrgent' | 'note'
type OverrideNotifyPayload = {
  affectedName: FamilyMember
  message: string
}

function App() {
  const [activeView, setActiveView] = useState<AppView>('booking')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selectedUser, setSelectedUser] = useState<FamilyMember>('Dad')
  const [theme, setTheme] = useState<ThemeName>('blue')
  const [selectedRequestedCarOption, setSelectedRequestedCarOption] = useState<RequestedCarOption>('noPreference')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [isUrgent, setIsUrgent] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [duplicateBookingToMergeId, setDuplicateBookingToMergeId] = useState<string | null>(null)
  const [overrideNotifyPayload, setOverrideNotifyPayload] = useState<OverrideNotifyPayload | null>(null)
  const [isUserSelectionModalOpen, setIsUserSelectionModalOpen] = useState(false)
  const [hasLoadedUserPreference, setHasLoadedUserPreference] = useState(false)

  const initialStart = useMemo(() => {
    const nextHour = new Date()
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0)
    return toInputDateTimeValue(nextHour)
  }, [])
  const initialEnd = useMemo(() => {
    const twoHours = new Date()
    twoHours.setHours(twoHours.getHours() + 2, 0, 0, 0)
    return toInputDateTimeValue(twoHours)
  }, [])

  const [startDate, setStartDate] = useState(() => splitDateTimeValue(initialStart).date)
  const [startTime, setStartTime] = useState(() => splitDateTimeValue(initialStart).time)
  const [endDate, setEndDate] = useState(() => splitDateTimeValue(initialEnd).date)
  const [endTime, setEndTime] = useState(() => splitDateTimeValue(initialEnd).time)

  useEffect(() => {
    const parsed = parseStoredBookings(localStorage.getItem(STORAGE_KEY))
    const hasStoredBookings = localStorage.getItem(STORAGE_KEY)
    if (parsed.length === 0 && hasStoredBookings) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      setBookings(parsed)
    }

    const savedUser = localStorage.getItem(CURRENT_USER_KEY)
    if (savedUser && FAMILY_MEMBERS.includes(savedUser as FamilyMember)) {
      setSelectedUser(savedUser as FamilyMember)
      setIsUserSelectionModalOpen(false)
    } else {
      setIsUserSelectionModalOpen(true)
    }
    setHasLoadedUserPreference(true)

    const savedTheme = localStorage.getItem(THEME_KEY)
    if (savedTheme === 'blue' || savedTheme === 'pink') {
      setTheme(savedTheme)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings))
  }, [bookings])

  useEffect(() => {
    if (!hasLoadedUserPreference || isUserSelectionModalOpen) {
      return
    }
    localStorage.setItem(CURRENT_USER_KEY, selectedUser)
    if (!PARENTS.includes(selectedUser)) {
      setIsUrgent(false)
    }
  }, [hasLoadedUserPreference, isUserSelectionModalOpen, selectedUser])

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const startDateTime = combineDateAndTime(startDate, startTime)
  const endDateTime = combineDateAndTime(endDate, endTime)

  const isParent = PARENTS.includes(selectedUser)
  const hasValidRange = isValidDateRange(startDateTime, endDateTime)
  const canUseUrgentVeto = isParent && isUrgent

  const assignedCars = useMemo((): CarId[] | null => {
    if (!hasValidRange) {
      return null
    }

    if (selectedRequestedCarOption === 'white') {
      return ['white']
    }
    if (selectedRequestedCarOption === 'red') {
      return ['red']
    }
    if (selectedRequestedCarOption === 'bothCars') {
      return ['white', 'red']
    }

    const preferred = preferredCarForUser(selectedUser)
    const alternative: CarId = preferred === 'white' ? 'red' : 'white'
    const preferredConflicts = getConflicts(bookings, [preferred], startDateTime, endDateTime)
    if (preferredConflicts.length === 0) {
      return [preferred]
    }

    const alternativeConflicts = getConflicts(bookings, [alternative], startDateTime, endDateTime)
    if (alternativeConflicts.length === 0) {
      return [alternative]
    }

    if (canUseUrgentVeto) {
      return [preferred]
    }

    return null
  }, [
    bookings,
    canUseUrgentVeto,
    endDateTime,
    hasValidRange,
    selectedRequestedCarOption,
    selectedUser,
    startDateTime,
  ])

  const conflicts = useMemo(() => {
    if (!hasValidRange || !assignedCars) {
      return []
    }
    return getConflicts(bookings, assignedCars, startDateTime, endDateTime)
  }, [assignedCars, bookings, endDateTime, hasValidRange, startDateTime])

  const selfConflicts = useMemo(
    () => conflicts.filter((booking) => booking.user === selectedUser),
    [conflicts, selectedUser],
  )
  const overridableConflicts = useMemo(
    () => conflicts.filter((booking) => booking.user !== selectedUser),
    [conflicts, selectedUser],
  )

  const canSubmit = hasValidRange &&
    assignedCars !== null &&
    (conflicts.length === 0 || (canUseUrgentVeto && selfConflicts.length === 0))
  const noCarAvailable = hasValidRange && selectedRequestedCarOption === 'noPreference' && assignedCars === null

  const pendingOverrideNotification = useMemo(
    () =>
      bookings
        .filter((booking) => booking.user === selectedUser)
        .filter((booking) => booking.status === 'overridden')
        .find((booking) => !booking.notified),
    [bookings, selectedUser],
  )

  const submitBooking = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatusMessage('')

    if (!canSubmit) {
      if (selfConflicts.length > 0) {
        setStatusMessage('You cannot override your own booking. Please delete or change your existing booking first.')
        return
      }
      setStatusMessage(
        selectedRequestedCarOption === 'noPreference' && assignedCars === null
          ? 'No car is available in this time range for automatic assignment.'
          : 'Please choose a valid time range and an available slot.',
      )
      return
    }
    if (!assignedCars) {
      return
    }

    const existingExactSameTimeBooking = bookings.find((existing) =>
      existing.user === selectedUser &&
      existing.startDateTime === startDateTime &&
      existing.endDateTime === endDateTime,
    )

    if (existingExactSameTimeBooking) {
      const existingHasBothCars =
        existingExactSameTimeBooking.assignedCars.includes('white') &&
        existingExactSameTimeBooking.assignedCars.includes('red')
      const newHasBothCars = assignedCars.includes('white') && assignedCars.includes('red')
      const sameAssignedCars =
        existingExactSameTimeBooking.assignedCars.length === assignedCars.length &&
        existingExactSameTimeBooking.assignedCars.every((car) => assignedCars.includes(car))

      if (existingHasBothCars || newHasBothCars) {
        setStatusMessage('You already have a booking for both cars at this exact time. New booking was not created.')
        return
      }

      if (sameAssignedCars) {
        setStatusMessage('You already have this exact booking time and car. New booking was not created.')
        return
      }

      setDuplicateBookingToMergeId(existingExactSameTimeBooking.id)
      return
    }

    const booking: Booking = {
      id: crypto.randomUUID(),
      title: title.trim(),
      user: selectedUser,
      requestedCarOption: selectedRequestedCarOption,
      assignedCars,
      startDateTime,
      endDateTime,
      isUrgent: canUseUrgentVeto,
      note: note.trim(),
      status: 'active',
      createdAt: new Date().toISOString(),
    }

    setBookings((current) => {
      if (booking.isUrgent && overridableConflicts.length > 0) {
        const conflictIds = new Set(overridableConflicts.map((item) => item.id))
        const updated = current.map((existing) => (
          conflictIds.has(existing.id)
            ? { ...existing, status: 'overridden' as const, overriddenByBookingId: booking.id, notified: false }
            : existing
        ))
        return [...updated, booking]
      }

      return [...current, booking]
    })

    setTitle('')
    setNote('')
    setSelectedRequestedCarOption('noPreference')

    if (booking.isUrgent && overridableConflicts.length > 0) {
      const affectedBooking = overridableConflicts[0]
      const formattedDate = new Date(affectedBooking.startDateTime).toLocaleDateString('he-IL')
      const formattedTime = `${formatTime(affectedBooking.startDateTime)}-${formatTime(affectedBooking.endDateTime)}`
      const notifyMessage = `היי ${affectedBooking.user},
מצטער/ת אבל נאלצתי לדרוס את בקשת הרכב שלך בתאריך ${formattedDate} בין השעות ${formattedTime}.
כדאי לבדוק את האפליקציה לעדכון.`

      setOverrideNotifyPayload({
        affectedName: affectedBooking.user,
        message: notifyMessage,
      })

      setStatusMessage(
        `Urgent booking saved and ${overridableConflicts.length} conflicting booking(s) were marked as overridden.`,
      )
      return
    }

    setStatusMessage('Booking saved successfully.')
  }

  const handleDeleteBooking = (bookingId: string) => {
    setBookings((current) => current.filter((booking) => booking.id !== bookingId))
  }

  const handleUseBothCarsForDuplicate = () => {
    if (!duplicateBookingToMergeId) {
      return
    }

    setBookings((current) =>
      current.map((existing) =>
        existing.id === duplicateBookingToMergeId
          ? {
            ...existing,
            requestedCarOption: 'bothCars',
            assignedCars: ['white', 'red'],
          }
          : existing,
      ),
    )
    setDuplicateBookingToMergeId(null)
    setStatusMessage('Existing booking was updated to use both cars.')
  }

  const handleCancelDuplicateMerge = () => {
    setDuplicateBookingToMergeId(null)
    setStatusMessage('Booking creation cancelled.')
  }

  const markBookingNotificationSeen = (bookingId: string) => {
    setBookings((current) => current.map((booking) => (
      booking.id === bookingId ? { ...booking, notified: true } : booking
    )))
  }

  const onFieldChange = <K extends BookingFormField>(
    key: K,
    value: (
      {
        title: string
        requestedCarOption: RequestedCarOption
        startDate: string
        startTime: string
        endDate: string
        endTime: string
        isUrgent: boolean
        note: string
      }
    )[K],
  ) => {
    if (key === 'title') {
      setTitle(value as string)
      return
    }
    if (key === 'requestedCarOption') {
      setSelectedRequestedCarOption(value as RequestedCarOption)
      return
    }
    if (key === 'startDate') {
      setStartDate(value as string)
      return
    }
    if (key === 'startTime') {
      setStartTime(value as string)
      return
    }
    if (key === 'endDate') {
      setEndDate(value as string)
      return
    }
    if (key === 'endTime') {
      setEndTime(value as string)
      return
    }
    if (key === 'isUrgent') {
      setIsUrgent(value as boolean)
      return
    }
    setNote(value as string)
  }

  const handleSelectCurrentUser = (user: FamilyMember) => {
    setSelectedUser(user)
    setIsUserSelectionModalOpen(false)
  }

  return (
    <main className={`app theme-${theme}`}>
      <header className="app-header">
        <div className="top-controls">
          <label>
            Current user
            <select
              value={selectedUser}
              onChange={(event) => setSelectedUser(event.target.value as FamilyMember)}
            >
              {FAMILY_MEMBERS.map((member) => (
                <option key={member} value={member}>
                  {member}
                </option>
              ))}
            </select>
          </label>

          <label>
            Theme
            <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeName)}>
              <option value="blue">Blue</option>
              <option value="pink">Pink</option>
            </select>
          </label>
        </div>

        <h1>Family Car Scheduler</h1>
        <p>Simple car booking for Dad, Mom, Noa and Yuval.</p>
      </header>

      {pendingOverrideNotification && (
        <section className="override-notice" role="status">
          <div>
            <strong>One of your bookings was overridden.</strong>
            <p>
              {formatDateTime(pendingOverrideNotification.startDateTime)} -{' '}
              {formatDateTime(pendingOverrideNotification.endDateTime)} |{' '}
              {labelForAssignedCars(pendingOverrideNotification.assignedCars)}
            </p>
          </div>
          <button type="button" onClick={() => markBookingNotificationSeen(pendingOverrideNotification.id)}>
            Dismiss
          </button>
        </section>
      )}

      <nav className="view-tabs" aria-label="App views">
        <button
          type="button"
          className={activeView === 'booking' ? 'active' : ''}
          onClick={() => setActiveView('booking')}
        >
          Booking form
        </button>
        <button
          type="button"
          className={activeView === 'calendar' ? 'active' : ''}
          onClick={() => setActiveView('calendar')}
        >
          Calendar
        </button>
        <button
          type="button"
          className={activeView === 'myBookings' ? 'active' : ''}
          onClick={() => setActiveView('myBookings')}
        >
          My Bookings
        </button>
      </nav>

      <section className="view-content">
        {activeView === 'booking' && (
          <ViewShell>
            <BookingForm
              values={{
                title,
                requestedCarOption: selectedRequestedCarOption,
                startDate,
                startTime,
                endDate,
                endTime,
                isUrgent,
                note,
              }}
              currentUser={selectedUser}
              conflicts={conflicts}
              selfConflicts={selfConflicts}
              isValidRange={hasValidRange}
              noCarAvailable={noCarAvailable}
              isParent={isParent}
              canSubmit={canSubmit}
              statusMessage={statusMessage}
              onFieldChange={onFieldChange}
              onSubmit={submitBooking}
            />
          </ViewShell>
        )}

        {activeView === 'calendar' && (
          <ViewShell>
            <WeeklyCalendar
              bookings={bookings}
              currentUser={selectedUser}
              onDeleteBooking={handleDeleteBooking}
            />
          </ViewShell>
        )}

        {activeView === 'myBookings' && (
          <ViewShell>
            <MyBookings currentUser={selectedUser} bookings={bookings} onDeleteBooking={handleDeleteBooking} />
          </ViewShell>
        )}
      </section>

      <ConfirmModal
        isOpen={duplicateBookingToMergeId !== null}
        title="Same time booking detected"
        message="You already have a booking at this exact time on a different car. You may want both cars, or this might be a duplicate by mistake."
        primaryLabel="Both cars"
        secondaryLabel="Cancel"
        onPrimary={handleUseBothCarsForDuplicate}
        onSecondary={handleCancelDuplicateMerge}
      />

      <UrgentOverrideModal
        isOpen={overrideNotifyPayload !== null}
        affectedName={overrideNotifyPayload?.affectedName ?? ''}
        message={overrideNotifyPayload?.message ?? ''}
        onClose={() => setOverrideNotifyPayload(null)}
      />

      <UserSelectionModal
        isOpen={isUserSelectionModalOpen}
        onSelectUser={handleSelectCurrentUser}
      />
    </main>
  )
}

export default App
