import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import BookingForm from './components/BookingForm'
import ConfirmModal from './components/ConfirmModal'
import MyBookings from './components/MyBookings'
import UrgentOverrideModal from './components/UrgentOverrideModal'
import UrgentOverrideSelectionModal from './components/UrgentOverrideSelectionModal'
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
  preferredCarForUser,
  splitDateTimeValue,
  toInputDateTimeValue,
} from './utils/bookingUtils'
import {
  attemptBooking,
  confirmBothCarsForExistingBooking,
  deleteBookingById,
  listBookings,
  type UrgentConflictCandidate,
  updateBookingById,
} from './services/bookingsService'
import type { AttemptBookingInput } from './services/bookingsService'
import './App.css'

const CURRENT_USER_KEY = 'carScheduler.currentUser.v1'
const THEME_KEY = 'carScheduler.theme.v1'

type AppView = 'booking' | 'calendar' | 'myBookings'
type ThemeName = 'blue' | 'pink'
type BookingFormField = 'title' | 'requestedCarOption' | 'bookingDate' | 'startTime' | 'endTime' | 'isUrgent'
type OverrideNotifyPayload = {
  affectedName: FamilyMember
  message: string
}
type PendingUrgentConfirmation = {
  attemptInput: AttemptBookingInput
  conflicts: UrgentConflictCandidate[]
  selectedConflictId: string | null
}
type Notice = {
  type: 'success' | 'error' | 'warning'
  message: string
}

function resolveAssignedCarsForRequest(
  sourceBookings: Booking[],
  requestedCarOption: RequestedCarOption,
  user: FamilyMember,
  startDateTime: string,
  endDateTime: string,
  canUseUrgentVeto: boolean,
): CarId[] | null {
  if (requestedCarOption === 'white') {
    return ['white']
  }
  if (requestedCarOption === 'red') {
    return ['red']
  }
  if (requestedCarOption === 'bothCars') {
    return ['white', 'red']
  }

  const preferred = preferredCarForUser(user)
  const alternative: CarId = preferred === 'white' ? 'red' : 'white'
  const preferredConflicts = getConflicts(sourceBookings, [preferred], startDateTime, endDateTime)
  if (preferredConflicts.length === 0) {
    return [preferred]
  }

  const alternativeConflicts = getConflicts(sourceBookings, [alternative], startDateTime, endDateTime)
  if (alternativeConflicts.length === 0) {
    return [alternative]
  }

  if (canUseUrgentVeto) {
    return [preferred]
  }

  return null
}

function App() {
  const [activeView, setActiveView] = useState<AppView>('booking')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [selectedUser, setSelectedUser] = useState<FamilyMember>('Dad')
  const [theme, setTheme] = useState<ThemeName>('blue')
  const [selectedRequestedCarOption, setSelectedRequestedCarOption] = useState<RequestedCarOption>('noPreference')
  const [title, setTitle] = useState('')
  const [isUrgent, setIsUrgent] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [isLoadingBookings, setIsLoadingBookings] = useState(true)
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false)
  const [duplicateBookingToMergeId, setDuplicateBookingToMergeId] = useState<string | null>(null)
  const [pendingUrgentConfirmation, setPendingUrgentConfirmation] = useState<PendingUrgentConfirmation | null>(null)
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

  const [bookingDate, setBookingDate] = useState(() => splitDateTimeValue(initialStart).date)
  const [startTime, setStartTime] = useState(() => splitDateTimeValue(initialStart).time)
  const [endTime, setEndTime] = useState(() => splitDateTimeValue(initialEnd).time)

  const refreshBookings = async (withLoader = false) => {
    if (withLoader) {
      setIsLoadingBookings(true)
    }

    try {
      const loaded = await listBookings()
      setBookings(loaded)
      return true
    } catch {
      setNotice({
        type: 'error',
        message: 'Could not load shared bookings right now. Please try again in a moment.',
      })
      return false
    } finally {
      if (withLoader) {
        setIsLoadingBookings(false)
      }
    }
  }

  useEffect(() => {
    const initialize = async () => {
      await refreshBookings(true)

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
    }

    initialize()
  }, [])

  useEffect(() => {
    if (!hasLoadedUserPreference || isUserSelectionModalOpen) {
      return
    }
    localStorage.setItem(CURRENT_USER_KEY, selectedUser)
    setNotice(null)
    if (!PARENTS.includes(selectedUser)) {
      setIsUrgent(false)
    }
  }, [hasLoadedUserPreference, isUserSelectionModalOpen, selectedUser])

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const startDateTime = combineDateAndTime(bookingDate, startTime)
  const endDateTime = combineDateAndTime(bookingDate, endTime)

  const isParent = PARENTS.includes(selectedUser)
  const hasValidRange = isValidDateRange(startDateTime, endDateTime)
  const canUseUrgentVeto = isParent && isUrgent

  const assignedCars = useMemo(
    () => (hasValidRange
      ? resolveAssignedCarsForRequest(
        bookings,
        selectedRequestedCarOption,
        selectedUser,
        startDateTime,
        endDateTime,
        canUseUrgentVeto,
      )
      : null),
    [bookings, canUseUrgentVeto, endDateTime, hasValidRange, selectedRequestedCarOption, selectedUser, startDateTime],
  )

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
  const whiteConflicts = useMemo(
    () => (hasValidRange ? getConflicts(bookings, ['white'], startDateTime, endDateTime) : []),
    [bookings, endDateTime, hasValidRange, startDateTime],
  )
  const redConflicts = useMemo(
    () => (hasValidRange ? getConflicts(bookings, ['red'], startDateTime, endDateTime) : []),
    [bookings, endDateTime, hasValidRange, startDateTime],
  )
  const whiteAvailable = useMemo(
    () => hasValidRange && whiteConflicts.length === 0,
    [hasValidRange, whiteConflicts],
  )
  const redAvailable = useMemo(
    () => hasValidRange && redConflicts.length === 0,
    [hasValidRange, redConflicts],
  )

  const canSubmit = hasValidRange && !isSubmittingBooking
  const noCarAvailable = hasValidRange && selectedRequestedCarOption === 'noPreference' && assignedCars === null

  const pendingOverrideNotification = useMemo(
    () =>
      bookings
        .filter((booking) => booking.user === selectedUser)
        .filter((booking) => booking.status === 'overridden')
        .find((booking) => !booking.notified),
    [bookings, selectedUser],
  )

  const buildUrgentConflictCandidates = (sourceBookings: Booking[]): UrgentConflictCandidate[] => {
    const unique = new Map<string, UrgentConflictCandidate>()
    for (const booking of sourceBookings) {
      if (booking.status !== 'active' || booking.user === selectedUser) {
        continue
      }
      if (!unique.has(booking.id)) {
        unique.set(booking.id, {
          id: booking.id,
          userName: booking.user,
          title: booking.title?.trim() ?? '',
          startDateTime: booking.startDateTime,
          endDateTime: booking.endDateTime,
          assignedCars: booking.assignedCars,
        })
      }
    }
    return [...unique.values()]
  }

  const getUrgentSelectionCandidates = (attemptInput: AttemptBookingInput): UrgentConflictCandidate[] => {
    if (attemptInput.requestedCarOption === 'noPreference') {
      return buildUrgentConflictCandidates([...whiteConflicts, ...redConflicts])
    }
    return buildUrgentConflictCandidates(conflicts)
  }

  const submitBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmittingBooking) {
      return
    }

    setIsSubmittingBooking(true)
    setNotice(null)

    try {
      if (!hasValidRange) {
        setNotice({ type: 'error', message: 'Please choose a valid time range and an available slot.' })
        return
      }

      const attemptInput: AttemptBookingInput = {
        bookingId: crypto.randomUUID(),
        title: title.trim(),
        userName: selectedUser,
        requestedCarOption: selectedRequestedCarOption,
        startDateTime,
        endDateTime,
        isUrgent: canUseUrgentVeto,
        note: '',
        confirmUrgentOverride: false,
      }
      const result = await attemptBooking(attemptInput)

      if (result.decision === 'blocked') {
        await refreshBookings()
        setNotice({ type: 'error', message: result.message })
        return
      }

      if (result.decision === 'needs_both_cars_decision') {
        setDuplicateBookingToMergeId(result.existingBookingId)
        setNotice({ type: 'warning', message: result.message })
        return
      }

      if (result.decision === 'needs_urgent_confirmation') {
        const conflictsForSelection = result.conflictingBookings?.length
          ? result.conflictingBookings
          : getUrgentSelectionCandidates(attemptInput)

        setPendingUrgentConfirmation({
          attemptInput,
          conflicts: conflictsForSelection,
          selectedConflictId: conflictsForSelection[0]?.id ?? null,
        })
        setNotice({ type: 'warning', message: 'Select which booking(s) you want to override.' })
        return
      }

      await refreshBookings()

      setTitle('')
      setSelectedRequestedCarOption('noPreference')

      if (result.decision === 'created_with_override') {
        const formattedDate = new Date(result.affectedStartDateTime).toLocaleDateString('he-IL')
        const formattedTime = `${formatTime(result.affectedStartDateTime)}-${formatTime(result.affectedEndDateTime)}`
        const notifyMessage = `היי ${result.affectedUserName},
מצטער/ת אבל נאלצתי לדרוס את בקשת הרכב שלך בתאריך ${formattedDate} בין השעות ${formattedTime}.
כדאי לבדוק את האפליקציה לעדכון.`

        setOverrideNotifyPayload({
          affectedName: result.affectedUserName,
          message: notifyMessage,
        })

        setNotice({
          type: 'success',
          message: result.message,
        })
        return
      }

      setNotice({ type: 'success', message: result.message })
    } catch {
      setNotice({ type: 'error', message: 'Could not save booking. Please try again.' })
    } finally {
      setIsSubmittingBooking(false)
    }
  }

  const handleDeleteBooking = async (bookingId: string) => {
    try {
      await deleteBookingById(bookingId)
      await refreshBookings()
      setNotice({ type: 'success', message: 'Booking deleted successfully.' })
    } catch {
      setNotice({ type: 'error', message: 'Could not delete booking. Please try again.' })
    }
  }

  const handleUseBothCarsForDuplicate = async () => {
    if (!duplicateBookingToMergeId) {
      return
    }

    try {
      await confirmBothCarsForExistingBooking(duplicateBookingToMergeId, selectedUser)
      await refreshBookings()
      setDuplicateBookingToMergeId(null)
      setNotice({ type: 'success', message: 'Booking updated to use both cars.' })
    } catch {
      setNotice({ type: 'error', message: 'Could not update booking. Please try again.' })
    }
  }

  const handleCancelDuplicateMerge = () => {
    setDuplicateBookingToMergeId(null)
    setNotice({ type: 'warning', message: 'Booking creation cancelled.' })
  }

  const handleConfirmUrgentOverride = async () => {
    if (!pendingUrgentConfirmation) {
      return
    }

    setIsSubmittingBooking(true)
    try {
      const result = await attemptBooking({
        ...pendingUrgentConfirmation.attemptInput,
        requestedCarOption: (() => {
          if (pendingUrgentConfirmation.attemptInput.requestedCarOption !== 'noPreference') {
            return pendingUrgentConfirmation.attemptInput.requestedCarOption
          }
          const selectedConflicts = pendingUrgentConfirmation.conflicts.filter((item) =>
            item.id === pendingUrgentConfirmation.selectedConflictId,
          )
          const selectedCars = new Set<CarId>()
          for (const item of selectedConflicts) {
            for (const car of item.assignedCars) {
              selectedCars.add(car)
            }
          }
          if (selectedCars.size === 1) {
            return [...selectedCars][0]
          }
          return pendingUrgentConfirmation.attemptInput.requestedCarOption
        })(),
        confirmUrgentOverride: true,
        overrideBookingIds: pendingUrgentConfirmation.selectedConflictId
          ? [pendingUrgentConfirmation.selectedConflictId]
          : [],
      })
      setPendingUrgentConfirmation(null)

      if (result.decision === 'blocked') {
        await refreshBookings()
        setNotice({ type: 'error', message: result.message })
        return
      }
      if (result.decision === 'needs_urgent_confirmation') {
        const conflictsForSelection = result.conflictingBookings?.length
          ? result.conflictingBookings
          : getUrgentSelectionCandidates(pendingUrgentConfirmation.attemptInput)

        setPendingUrgentConfirmation({
          attemptInput: pendingUrgentConfirmation.attemptInput,
          conflicts: conflictsForSelection,
          selectedConflictId: conflictsForSelection[0]?.id ?? null,
        })
        setNotice({ type: 'warning', message: 'Select which booking(s) you want to override.' })
        return
      }
      if (result.decision === 'needs_both_cars_decision') {
        setDuplicateBookingToMergeId(result.existingBookingId)
        setNotice({ type: 'warning', message: result.message })
        return
      }

      await refreshBookings()
      setTitle('')
      setSelectedRequestedCarOption('noPreference')

      if (result.decision === 'created_with_override') {
        const formattedDate = new Date(result.affectedStartDateTime).toLocaleDateString('he-IL')
        const formattedTime = `${formatTime(result.affectedStartDateTime)}-${formatTime(result.affectedEndDateTime)}`
        const notifyMessage = `היי ${result.affectedUserName},
מצטער/ת אבל נאלצתי לדרוס את בקשת הרכב שלך בתאריך ${formattedDate} בין השעות ${formattedTime}.
כדאי לבדוק את האפליקציה לעדכון.`

        setOverrideNotifyPayload({
          affectedName: result.affectedUserName,
          message: notifyMessage,
        })
      }

      setNotice({ type: 'success', message: result.message })
    } catch {
      setNotice({ type: 'error', message: 'Could not save booking. Please try again.' })
    } finally {
      setIsSubmittingBooking(false)
    }
  }

  const handleCancelUrgentOverride = () => {
    setPendingUrgentConfirmation(null)
    setNotice({ type: 'warning', message: 'Urgent override was cancelled.' })
  }

  const handleSelectUrgentConflict = (bookingId: string) => {
    setPendingUrgentConfirmation((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        selectedConflictId: bookingId,
      }
    })
  }

  const markBookingNotificationSeen = async (bookingId: string) => {
    try {
      await updateBookingById(bookingId, { notified: true })
      await refreshBookings()
    } catch {
      setNotice({ type: 'error', message: 'Could not update notification state.' })
    }
  }

  const onFieldChange = <K extends BookingFormField>(
    key: K,
    value: (
      {
        title: string
        requestedCarOption: RequestedCarOption
        bookingDate: string
        startTime: string
        endTime: string
        isUrgent: boolean
      }
    )[K],
  ) => {
    if (notice) {
      setNotice(null)
    }
    if (key === 'title') {
      setTitle(value as string)
      return
    }
    if (key === 'requestedCarOption') {
      setSelectedRequestedCarOption(value as RequestedCarOption)
      return
    }
    if (key === 'startTime') {
      setStartTime(value as string)
      return
    }
    if (key === 'bookingDate') {
      setBookingDate(value as string)
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

      {notice && (
        <section className={`app-notice ${notice.type}`} role="status">
          <p>{notice.message}</p>
          <button type="button" onClick={() => setNotice(null)}>Dismiss</button>
        </section>
      )}

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
        {isLoadingBookings && (
          <ViewShell>
            <section className="panel loading-panel">
              <p>Loading shared bookings...</p>
            </section>
          </ViewShell>
        )}

        {!isLoadingBookings && activeView === 'booking' && (
          <ViewShell>
            <BookingForm
              values={{
                title,
                requestedCarOption: selectedRequestedCarOption,
                bookingDate,
                startTime,
                endTime,
                isUrgent,
              }}
              currentUser={selectedUser}
              conflicts={conflicts}
              selfConflicts={selfConflicts}
              whiteConflicts={whiteConflicts}
              redConflicts={redConflicts}
              isValidRange={hasValidRange}
              noCarAvailable={noCarAvailable}
              isParent={isParent}
              canSubmit={canSubmit}
              whiteAvailable={whiteAvailable}
              redAvailable={redAvailable}
              onFieldChange={onFieldChange}
              onSubmit={submitBooking}
            />
          </ViewShell>
        )}

        {!isLoadingBookings && activeView === 'calendar' && (
          <ViewShell>
            <WeeklyCalendar
              bookings={bookings}
              currentUser={selectedUser}
              onDeleteBooking={handleDeleteBooking}
            />
          </ViewShell>
        )}

        {!isLoadingBookings && activeView === 'myBookings' && (
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

      <UrgentOverrideSelectionModal
        isOpen={pendingUrgentConfirmation !== null}
        conflicts={pendingUrgentConfirmation?.conflicts ?? []}
        selectedId={pendingUrgentConfirmation?.selectedConflictId ?? null}
        onSelect={handleSelectUrgentConflict}
        onConfirm={handleConfirmUrgentOverride}
        onCancel={handleCancelUrgentOverride}
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
