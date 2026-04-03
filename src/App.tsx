import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import BookingForm from './components/BookingForm'
import AutoResolutionModal from './components/AutoResolutionModal'
import ConfirmModal from './components/ConfirmModal'
import EditBookingTimeModal from './components/EditBookingTimeModal'
import MyBookings from './components/MyBookings'
import RecurringDeleteModal from './components/RecurringDeleteModal'
import SwitchRequestMessageModal from './components/SwitchRequestMessageModal'
import UrgentOverrideModal from './components/UrgentOverrideModal'
import UrgentOverrideSelectionModal from './components/UrgentOverrideSelectionModal'
import ViewShell from './components/ViewShell'
import UserSelectionModal from './components/UserSelectionModal'
import WeeklyCalendar from './components/WeeklyCalendar'
import type { Booking, CarId, CarSwitchRequest, FamilyMember, RequestedCarOption } from './types'
import { FAMILY_MEMBERS, PARENTS } from './types'
import {
  combineDateAndTime,
  formatDateTime,
  formatTime,
  getConflicts,
  getWeekStart,
  isValidDateRange,
  labelForAssignedCars,
  preferredCarForUser,
  splitDateTimeValue,
  toInputDateTimeValue,
} from './utils/bookingUtils'
import { generateUuid } from './utils/idUtils'
import {
  approveAndApplyCarSwitchRequest,
  attemptBooking,
  createCarSwitchRequest,
  confirmBothCarsForExistingBooking,
  deleteBookingById,
  expireElapsedCarSwitchRequests,
  listCarSwitchRequests,
  listBookings,
  restoreDeletedBookings,
  syncCalendarBacklog,
  updateCarSwitchRequestStatus,
  type UrgentConflictCandidate,
  updateBookingById,
  updateBookingDetailsById,
} from './services/bookingsService'
import type { AttemptBookingInput, CreateCarSwitchRequestInput } from './services/bookingsService'
import './App.css'

const CURRENT_USER_KEY = 'carScheduler.currentUser.v1'
const THEME_KEY = 'carScheduler.theme.v1'

type AppView = 'booking' | 'calendar' | 'myBookings'
type ThemeName = 'blue' | 'pink'
type BookingFormField =
  | 'title'
  | 'requestedCarOption'
  | 'bookingDate'
  | 'startTime'
  | 'endTime'
  | 'isUrgent'
  | 'isRecurring'
  | 'recurringWeekdays'
type OverrideNotifyPayload = {
  affectedName: FamilyMember
  message: string
}
type SwitchMessagePayload = {
  recipientName: FamilyMember
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
type ProximitySeverity = 'low' | 'medium' | 'high'
type ProximityAlert = {
  severity: ProximitySeverity
  minGapMinutes: number
  details: string[]
}
type AutoResolutionMode = 'ready' | 'override'
type AutoResolutionOption = {
  id: string
  mode: AutoResolutionMode
  startDateTime: string
  endDateTime: string
  requestedCarOption: RequestedCarOption
  assignedCars: CarId[]
  score: number
  proximitySeverity?: ProximitySeverity
  proximityGapMinutes?: number
  timeDistanceMinutes: number
  durationDeltaMinutes: number
  keepsRequestedCar: boolean
  overrideImpacts: Array<{ user: FamilyMember; startDateTime: string; endDateTime: string }>
}
type CarSwitchCandidate = {
  id: string
  requestedBookingId: string
  requestedUserName: FamilyMember
  requestedCurrentCar: CarId
  requestedTargetCar: CarId
  requesterRequestedCarOption: RequestedCarOption
  requesterStartDateTime: string
  requesterEndDateTime: string
  expiresAt: string
  whatsappMessage: string
}
type PendingAutoResolution =
  | {
    action: 'new'
    readyNow: AutoResolutionOption[]
    requiresOverride: AutoResolutionOption[]
    switchCandidates: CarSwitchCandidate[]
  }
  | {
    action: 'edit'
    bookingId: string
    bookingTitle: string
    readyNow: AutoResolutionOption[]
    requiresOverride: AutoResolutionOption[]
    switchCandidates: CarSwitchCandidate[]
  }
type PendingProximityConfirmation =
  | { action: 'new'; title: string; message: string; severity: ProximitySeverity }
  | {
    action: 'edit'
    modalTitle: string
    message: string
    severity: ProximitySeverity
    bookingId: string
    bookingTitle: string
    startDateTime: string
    endDateTime: string
  }
type PendingRecurringDeleteConfirmation = {
  bookingId: string
  relatedBookingIds: string[]
  weekLabel: string
}
type PendingUndoDelete = {
  bookings: Booking[]
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const candidate = (error as { message?: unknown }).message
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate
    }
  }
  return fallback
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

function hasCarIntersection(a: CarId[], b: CarId[]): boolean {
  return a.some((car) => b.includes(car))
}

function weekKeyFromIso(dateTime: string): string {
  const weekStart = getWeekStart(new Date(dateTime))
  const year = weekStart.getFullYear()
  const month = String(weekStart.getMonth() + 1).padStart(2, '0')
  const day = String(weekStart.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function timeOfDayFromIso(dateTime: string): string {
  return splitDateTimeValue(dateTime).time
}

function proximitySeverityFromGapMinutes(gapMinutes: number): ProximitySeverity | null {
  if (gapMinutes < 0 || gapMinutes > 60) {
    return null
  }
  if (gapMinutes <= 15) {
    return 'high'
  }
  if (gapMinutes <= 30) {
    return 'medium'
  }
  return 'low'
}

function proximitySeverityRank(severity: ProximitySeverity): number {
  if (severity === 'high') {
    return 3
  }
  if (severity === 'medium') {
    return 2
  }
  return 1
}

function proximityTitleFromSeverity(severity: ProximitySeverity): string {
  if (severity === 'high') {
    return 'High proximity alert'
  }
  if (severity === 'medium') {
    return 'Medium proximity alert'
  }
  return 'Low proximity alert'
}

function proximityLabelFromSeverity(severity: ProximitySeverity): string {
  if (severity === 'high') {
    return 'HIGH'
  }
  if (severity === 'medium') {
    return 'MEDIUM'
  }
  return 'LOW'
}

function severityPenalty(severity?: ProximitySeverity): number {
  if (severity === 'high') {
    return 6
  }
  if (severity === 'medium') {
    return 4
  }
  if (severity === 'low') {
    return 2
  }
  return 0
}

function getProximityAlert(
  sourceBookings: Booking[],
  assignedCars: CarId[],
  startDateTime: string,
  endDateTime: string,
  excludeBookingId?: string,
): ProximityAlert | null {
  const startMs = new Date(startDateTime).getTime()
  const endMs = new Date(endDateTime).getTime()

  let nearestPrevious: Booking | null = null
  let nearestPreviousGap = Number.POSITIVE_INFINITY
  let nearestNext: Booking | null = null
  let nearestNextGap = Number.POSITIVE_INFINITY

  for (const booking of sourceBookings) {
    if (booking.status !== 'active') {
      continue
    }
    if (excludeBookingId && booking.id === excludeBookingId) {
      continue
    }
    if (!hasCarIntersection(booking.assignedCars, assignedCars)) {
      continue
    }

    const otherStartMs = new Date(booking.startDateTime).getTime()
    const otherEndMs = new Date(booking.endDateTime).getTime()

    if (otherEndMs <= startMs) {
      const gap = startMs - otherEndMs
      if (gap < nearestPreviousGap) {
        nearestPreviousGap = gap
        nearestPrevious = booking
      }
    }

    if (otherStartMs >= endMs) {
      const gap = otherStartMs - endMs
      if (gap < nearestNextGap) {
        nearestNextGap = gap
        nearestNext = booking
      }
    }
  }

  const details: string[] = []
  const severities: ProximitySeverity[] = []
  const gapMinutes: number[] = []

  if (nearestPrevious && nearestPreviousGap <= 60 * 60 * 1000) {
    const gap = Math.round(nearestPreviousGap / 60000)
    const severity = proximitySeverityFromGapMinutes(gap)
    if (severity) {
      details.push(
        `Starts ${gap} min after ${nearestPrevious.user}'s booking (${formatTime(nearestPrevious.startDateTime)}-${formatTime(nearestPrevious.endDateTime)}).`,
      )
      severities.push(severity)
      gapMinutes.push(gap)
    }
  }

  if (nearestNext && nearestNextGap <= 60 * 60 * 1000) {
    const gap = Math.round(nearestNextGap / 60000)
    const severity = proximitySeverityFromGapMinutes(gap)
    if (severity) {
      details.push(
        `Ends ${gap} min before ${nearestNext.user}'s booking (${formatTime(nearestNext.startDateTime)}-${formatTime(nearestNext.endDateTime)}).`,
      )
      severities.push(severity)
      gapMinutes.push(gap)
    }
  }

  if (severities.length === 0 || details.length === 0 || gapMinutes.length === 0) {
    return null
  }

  const severity = severities.reduce((best, current) =>
    proximitySeverityRank(current) > proximitySeverityRank(best) ? current : best)

  return {
    severity,
    minGapMinutes: Math.min(...gapMinutes),
    details,
  }
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
  const [switchMessagePayload, setSwitchMessagePayload] = useState<SwitchMessagePayload | null>(null)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [pendingProximityConfirmation, setPendingProximityConfirmation] = useState<PendingProximityConfirmation | null>(null)
  const [pendingAutoResolution, setPendingAutoResolution] = useState<PendingAutoResolution | null>(null)
  const [carSwitchRequests, setCarSwitchRequests] = useState<CarSwitchRequest[]>([])
  const [pendingRecurringDelete, setPendingRecurringDelete] = useState<PendingRecurringDeleteConfirmation | null>(null)
  const [pendingUndoDelete, setPendingUndoDelete] = useState<PendingUndoDelete | null>(null)
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0)
  const [isUserSelectionModalOpen, setIsUserSelectionModalOpen] = useState(false)
  const [hasLoadedUserPreference, setHasLoadedUserPreference] = useState(false)
  const undoDeleteTimerRef = useRef<number | null>(null)
  const undoDeleteIntervalRef = useRef<number | null>(null)

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
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurringWeekdays, setRecurringWeekdays] = useState<number[]>([])

  const refreshBookings = async (withLoader = false) => {
    if (withLoader) {
      setIsLoadingBookings(true)
    }

    try {
      const loaded = await listBookings()
      setBookings(loaded)
      void syncCalendarBacklog(loaded)
      try {
        await expireElapsedCarSwitchRequests(new Date().toISOString())
        const requests = await listCarSwitchRequests()
        setCarSwitchRequests(requests)
      } catch (switchError) {
        console.error('Could not load car-switch requests', switchError)
      }
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

  useEffect(() => () => {
    if (undoDeleteTimerRef.current !== null) {
      window.clearTimeout(undoDeleteTimerRef.current)
    }
    if (undoDeleteIntervalRef.current !== null) {
      window.clearInterval(undoDeleteIntervalRef.current)
    }
  }, [])

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

  const hasRecurringSelection = !isRecurring || recurringWeekdays.length > 0
  const canSubmit = hasValidRange && hasRecurringSelection && !isSubmittingBooking
  const noCarAvailable = hasValidRange && selectedRequestedCarOption === 'noPreference' && assignedCars === null

  const pendingOverrideNotification = useMemo(
    () =>
      bookings
        .filter((booking) => booking.user === selectedUser)
        .filter((booking) => booking.status === 'overridden')
        .find((booking) => !booking.notified),
    [bookings, selectedUser],
  )
  const incomingPendingSwitchRequests = useMemo(
    () => carSwitchRequests.filter((request) =>
      request.status === 'pending' &&
      request.requestedUserName === selectedUser &&
      new Date(request.requesterStartDateTime).getTime() > Date.now()),
    [carSwitchRequests, selectedUser],
  )
  const outgoingPendingSwitchRequests = useMemo(
    () => carSwitchRequests.filter((request) =>
      request.status === 'pending' &&
      request.requesterName === selectedUser &&
      new Date(request.requesterStartDateTime).getTime() > Date.now()),
    [carSwitchRequests, selectedUser],
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

  const getRecurringDatesInSelectedWeek = (): string[] => {
    if (!isRecurring || recurringWeekdays.length === 0 || !bookingDate) {
      return [bookingDate]
    }

    const anchor = new Date(`${bookingDate}T00:00:00`)
    if (Number.isNaN(anchor.getTime())) {
      return [bookingDate]
    }

    const weekStart = getWeekStart(anchor)
    const selected = [...new Set(recurringWeekdays)].sort((a, b) => a - b)

    return selected.map((weekday) => {
      const date = new Date(weekStart)
      date.setDate(weekStart.getDate() + weekday)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    })
  }

  const buildCarSwitchCandidates = (params: {
    currentUser: FamilyMember
    requestedCarOption: RequestedCarOption
    requesterStartDateTime: string
    requesterEndDateTime: string
  }): CarSwitchCandidate[] => {
    const requestedCarsToTry: CarId[] = params.requestedCarOption === 'white'
      ? ['white']
      : params.requestedCarOption === 'red'
        ? ['red']
        : params.requestedCarOption === 'noPreference'
          ? ['white', 'red']
          : []

    if (requestedCarsToTry.length === 0) {
      return []
    }

    const candidates: CarSwitchCandidate[] = []
    const seen = new Set<string>()

    for (const requestedCar of requestedCarsToTry) {
      const targetCar: CarId = requestedCar === 'white' ? 'red' : 'white'
      const overlapsOnRequestedCar = getConflicts(
        bookings,
        [requestedCar],
        params.requesterStartDateTime,
        params.requesterEndDateTime,
      ).filter((booking) => booking.status === 'active' && booking.user !== params.currentUser)

      for (const blocker of overlapsOnRequestedCar) {
        if (blocker.assignedCars.length !== 1 || blocker.assignedCars[0] !== requestedCar) {
          continue
        }

        const blockerTargetConflicts = getConflicts(
          bookings.filter((booking) => booking.id !== blocker.id),
          [targetCar],
          blocker.startDateTime,
          blocker.endDateTime,
        ).filter((booking) => booking.status === 'active')

        if (blockerTargetConflicts.length > 0) {
          continue
        }

        const requesterRemainingConflicts = getConflicts(
          bookings.filter((booking) => booking.id !== blocker.id),
          [requestedCar],
          params.requesterStartDateTime,
          params.requesterEndDateTime,
        ).filter((booking) => booking.status === 'active' && booking.user !== params.currentUser)

        if (requesterRemainingConflicts.length > 0) {
          continue
        }

        const expiryMs = Math.min(
          new Date(params.requesterStartDateTime).getTime(),
          new Date(blocker.startDateTime).getTime(),
        )
        if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
          continue
        }

        const requesterDateLabel = new Date(params.requesterStartDateTime).toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
        const formattedStart = formatTime(params.requesterStartDateTime)
        const formattedEnd = formatTime(params.requesterEndDateTime)
        const blockerStart = formatTime(blocker.startDateTime)
        const blockerEnd = formatTime(blocker.endDateTime)
        const whatsappMessage =
          `Hi ${blocker.user},\n\n` +
          `Can we do a quick car switch on ${requesterDateLabel}?\n` +
          `- Your current booking: ${requestedCar} (${blockerStart}-${blockerEnd})\n` +
          `- Requested switch: move to ${targetCar} (same time)\n` +
          `- I need: ${requestedCar} (${formattedStart}-${formattedEnd})\n\n` +
          `Thanks!`

        const key = `${blocker.id}|${requestedCar}|${targetCar}|${params.requesterStartDateTime}|${params.requesterEndDateTime}`
        if (seen.has(key)) {
          continue
        }
        seen.add(key)

        candidates.push({
          id: key,
          requestedBookingId: blocker.id,
          requestedUserName: blocker.user,
          requestedCurrentCar: requestedCar,
          requestedTargetCar: targetCar,
          requesterRequestedCarOption: requestedCar,
          requesterStartDateTime: params.requesterStartDateTime,
          requesterEndDateTime: params.requesterEndDateTime,
          expiresAt: new Date(expiryMs).toISOString(),
          whatsappMessage,
        })
      }
    }

    return candidates.slice(0, 3)
  }

  const buildAutoResolutionSuggestions = (params: {
    currentUser: FamilyMember
    canUseOverride: boolean
    requestedCarOption: RequestedCarOption
    baseStartDateTime: string
    baseEndDateTime: string
    excludeBookingId?: string
    originalAssignedCars?: CarId[]
    fixedAssignedCars?: CarId[]
  }): { readyNow: AutoResolutionOption[]; requiresOverride: AutoResolutionOption[] } => {
    const baseStart = new Date(params.baseStartDateTime)
    const baseEnd = new Date(params.baseEndDateTime)
    const baseDurationMinutes = Math.round((baseEnd.getTime() - baseStart.getTime()) / 60000)
    if (Number.isNaN(baseDurationMinutes) || baseDurationMinutes <= 0) {
      return { readyNow: [], requiresOverride: [] }
    }

    const dayStart = new Date(baseStart)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const durationOptions = [
      baseDurationMinutes,
      baseDurationMinutes - 30,
      baseDurationMinutes + 30,
      baseDurationMinutes - 60,
      baseDurationMinutes + 60,
    ].filter((value, index, arr) =>
      value >= 30 &&
      value <= 12 * 60 &&
      arr.indexOf(value) === index)

    const carCombos: Array<{ requested: RequestedCarOption; assigned: CarId[]; carPenalty: number }> =
      params.fixedAssignedCars
        ? [{
          requested: params.requestedCarOption,
          assigned: params.fixedAssignedCars,
          carPenalty: 0,
        }]
        : (() => {
          if (params.requestedCarOption === 'white') {
            return [
              { requested: 'white' as RequestedCarOption, assigned: ['white' as CarId], carPenalty: 0 },
              { requested: 'red' as RequestedCarOption, assigned: ['red' as CarId], carPenalty: 1 },
            ]
          }
          if (params.requestedCarOption === 'red') {
            return [
              { requested: 'red' as RequestedCarOption, assigned: ['red' as CarId], carPenalty: 0 },
              { requested: 'white' as RequestedCarOption, assigned: ['white' as CarId], carPenalty: 1 },
            ]
          }
          if (params.requestedCarOption === 'bothCars') {
            return [{ requested: 'bothCars' as RequestedCarOption, assigned: ['white' as CarId, 'red' as CarId], carPenalty: 0 }]
          }
          const preferred = preferredCarForUser(params.currentUser)
          const alternative: CarId = preferred === 'white' ? 'red' : 'white'
          return [
            { requested: preferred, assigned: [preferred], carPenalty: 0 },
            { requested: alternative, assigned: [alternative], carPenalty: 2 },
          ]
        })()

    const candidates: AutoResolutionOption[] = []
    const seen = new Set<string>()
    const stepMinutes = 15
    const baseStartMs = baseStart.getTime()

    for (const duration of durationOptions) {
      const phasePenalty = duration === baseDurationMinutes ? 0 : 3
      for (let cursor = dayStart.getTime(); cursor + duration * 60000 <= dayEnd.getTime(); cursor += stepMinutes * 60000) {
        const startMs = cursor
        const endMs = cursor + duration * 60000
        const startIso = new Date(startMs).toISOString()
        const endIso = new Date(endMs).toISOString()

        for (const combo of carCombos) {
          if (
            startIso === params.baseStartDateTime &&
            endIso === params.baseEndDateTime &&
            combo.assigned.join(',') === (params.originalAssignedCars ?? params.fixedAssignedCars ?? combo.assigned).join(',')
          ) {
            continue
          }

          const overlapConflicts = getConflicts(
            params.excludeBookingId ? bookings.filter((booking) => booking.id !== params.excludeBookingId) : bookings,
            combo.assigned,
            startIso,
            endIso,
          )
          const selfOverlap = overlapConflicts.some((booking) => booking.user === params.currentUser)
          if (selfOverlap) {
            continue
          }

          const otherOverlap = overlapConflicts.filter((booking) => booking.user !== params.currentUser)
          const mode: AutoResolutionMode = otherOverlap.length === 0 ? 'ready' : 'override'
          if (mode === 'override' && !params.canUseOverride) {
            continue
          }

          const proximity = getProximityAlert(
            params.excludeBookingId ? bookings.filter((booking) => booking.id !== params.excludeBookingId) : bookings,
            combo.assigned,
            startIso,
            endIso,
            params.excludeBookingId,
          )

          const timeDistanceMinutes = Math.round(Math.abs(startMs - baseStartMs) / 60000)
          const durationDeltaMinutes = Math.abs(duration - baseDurationMinutes)
          const overlapStart = Math.max(startMs, baseStart.getTime())
          const overlapEnd = Math.min(endMs, baseEnd.getTime())
          const overlapMinutes = Math.max(0, Math.round((overlapEnd - overlapStart) / 60000))
          const overlapPenalty = Math.max(0, Math.round((baseDurationMinutes - overlapMinutes) / 15))

          // Hide weak matches that are too far from the requested slot.
          if (timeDistanceMinutes > 2 * 60) {
            continue
          }
          if (durationDeltaMinutes > 60) {
            continue
          }

          const exactTimeBonus = (startIso === params.baseStartDateTime && endIso === params.baseEndDateTime) ? -4 : 0

          const score =
            (mode === 'ready' ? 0 : 20) +
            phasePenalty +
            combo.carPenalty +
            severityPenalty(proximity?.severity) +
            Math.round(timeDistanceMinutes / 8) +
            Math.round(durationDeltaMinutes / 15) +
            overlapPenalty +
            exactTimeBonus

          const impacts = otherOverlap
            .slice(0, 3)
            .map((booking) => ({
              user: booking.user,
              startDateTime: booking.startDateTime,
              endDateTime: booking.endDateTime,
            }))

          const dedupeKey = `${mode}|${startIso}|${endIso}|${combo.assigned.join(',')}`
          if (seen.has(dedupeKey)) {
            continue
          }
          seen.add(dedupeKey)

          candidates.push({
            id: dedupeKey,
            mode,
            startDateTime: startIso,
            endDateTime: endIso,
            requestedCarOption: combo.requested,
            assignedCars: combo.assigned,
            score,
            proximitySeverity: proximity?.severity,
            proximityGapMinutes: proximity?.minGapMinutes,
            timeDistanceMinutes,
            durationDeltaMinutes,
            keepsRequestedCar: combo.requested === params.requestedCarOption,
            overrideImpacts: impacts,
          })
        }
      }
    }

    const readySorted = candidates
      .filter((option) => option.mode === 'ready')
      .sort((a, b) => a.score - b.score)
    const overrideSorted = candidates
      .filter((option) => option.mode === 'override')
      .sort((a, b) => a.score - b.score)

    const filterByQuality = (sorted: AutoResolutionOption[]): AutoResolutionOption[] => {
      if (sorted.length === 0) {
        return []
      }
      const bestScore = sorted[0].score
      const closeToRequest = sorted.filter((option) =>
        option.timeDistanceMinutes <= 60 &&
        option.durationDeltaMinutes <= 30 &&
        option.score <= bestScore + 6)

      if (closeToRequest.length > 0) {
        const ranked = closeToRequest
          .sort((a, b) => {
            if (a.keepsRequestedCar !== b.keepsRequestedCar) {
              return a.keepsRequestedCar ? -1 : 1
            }
            return a.score - b.score
          })

        const uniqueByAssignedCars: AutoResolutionOption[] = []
        const seenCars = new Set<string>()
        for (const option of ranked) {
          const carsKey = option.assignedCars.join(',')
          if (seenCars.has(carsKey)) {
            continue
          }
          seenCars.add(carsKey)
          uniqueByAssignedCars.push(option)
          if (uniqueByAssignedCars.length >= 3) {
            break
          }
        }

        if (uniqueByAssignedCars.length > 0) {
          return uniqueByAssignedCars
        }

        return ranked.slice(0, 3)
      }

      return sorted.filter((option) => option.score <= bestScore + 5).slice(0, 2)
    }

    const exactReady = readySorted.filter((option) =>
      option.startDateTime === params.baseStartDateTime &&
      option.endDateTime === params.baseEndDateTime)
    if (exactReady.length > 0) {
      return { readyNow: [exactReady[0]], requiresOverride: [] }
    }

    const readyNow = filterByQuality(readySorted)
    const remainingSlots = Math.max(0, 3 - readyNow.length)
    const requiresOverride = remainingSlots > 0 ? filterByQuality(overrideSorted).slice(0, remainingSlots) : []

    return { readyNow, requiresOverride }
  }

  const runCreateBooking = async (skipProximityCheck: boolean, skipAutoResolution = false) => {
    if (isSubmittingBooking) {
      return
    }

    if (!hasValidRange) {
      setNotice({ type: 'error', message: 'Please choose a valid time range and an available slot.' })
      return
    }

    if (!assignedCars) {
      if (!skipAutoResolution) {
        const suggestions = buildAutoResolutionSuggestions({
          currentUser: selectedUser,
          canUseOverride: canUseUrgentVeto,
          requestedCarOption: selectedRequestedCarOption,
          baseStartDateTime: startDateTime,
          baseEndDateTime: endDateTime,
          originalAssignedCars: assignedCars ?? undefined,
        })
        const switchCandidates = buildCarSwitchCandidates({
          currentUser: selectedUser,
          requestedCarOption: selectedRequestedCarOption,
          requesterStartDateTime: startDateTime,
          requesterEndDateTime: endDateTime,
        })
        if (suggestions.readyNow.length > 0 || suggestions.requiresOverride.length > 0 || switchCandidates.length > 0) {
          setPendingAutoResolution({
            action: 'new',
            readyNow: suggestions.readyNow,
            requiresOverride: suggestions.requiresOverride,
            switchCandidates,
          })
          return
        }
      }
      setNotice({ type: 'error', message: 'No available car for this range. Please choose a different time.' })
      return
    }

    if (!skipProximityCheck) {
      const alert = getProximityAlert(bookings, assignedCars, startDateTime, endDateTime)
      if (alert) {
        setPendingProximityConfirmation({
          action: 'new',
          title: proximityTitleFromSeverity(alert.severity),
          message: `${proximityLabelFromSeverity(alert.severity)} proximity (${alert.minGapMinutes} min). ${alert.details.join(' ')} Continue anyway?`,
          severity: alert.severity,
        })
        return
      }
    }

    setIsSubmittingBooking(true)
    setNotice(null)

    try {
      const attemptInput: AttemptBookingInput = {
        bookingId: generateUuid(),
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
        if (!skipAutoResolution) {
          const suggestions = buildAutoResolutionSuggestions({
            currentUser: selectedUser,
            canUseOverride: canUseUrgentVeto,
            requestedCarOption: selectedRequestedCarOption,
            baseStartDateTime: startDateTime,
            baseEndDateTime: endDateTime,
            originalAssignedCars: assignedCars ?? undefined,
          })
          const switchCandidates = buildCarSwitchCandidates({
            currentUser: selectedUser,
            requestedCarOption: selectedRequestedCarOption,
            requesterStartDateTime: startDateTime,
            requesterEndDateTime: endDateTime,
          })
          if (suggestions.readyNow.length > 0 || suggestions.requiresOverride.length > 0 || switchCandidates.length > 0) {
            setPendingAutoResolution({
              action: 'new',
              readyNow: suggestions.readyNow,
              requiresOverride: suggestions.requiresOverride,
              switchCandidates,
            })
            setIsSubmittingBooking(false)
            return
          }
        }
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
    } catch (error) {
      const message = getErrorMessage(error, 'Could not save booking. Please try again.')
      console.error('Booking submission failed', error)
      setNotice({ type: 'error', message })
    } finally {
      setIsSubmittingBooking(false)
    }
  }

  const runCreateRecurringBookings = async () => {
    const targetDates = getRecurringDatesInSelectedWeek().filter(Boolean)
    if (targetDates.length <= 1) {
      await runCreateBooking(false)
      return
    }

    if (recurringWeekdays.length === 0) {
      setNotice({ type: 'error', message: 'Select at least one weekday for recurring booking.' })
      return
    }

    if (isSubmittingBooking) {
      return
    }

    setIsSubmittingBooking(true)
    setNotice(null)

    let createdCount = 0
    const skipped: string[] = []

    try {
      for (const date of targetDates) {
        const start = combineDateAndTime(date, startTime)
        const end = combineDateAndTime(date, endTime)

        if (!isValidDateRange(start, end)) {
          skipped.push(`${date}: invalid time range`)
          continue
        }

        const assignedForDate = resolveAssignedCarsForRequest(
          bookings,
          selectedRequestedCarOption,
          selectedUser,
          start,
          end,
          canUseUrgentVeto,
        )

        if (!assignedForDate) {
          skipped.push(`${date}: no available car`)
          continue
        }

        const alert = getProximityAlert(bookings, assignedForDate, start, end)
        if (alert) {
          const confirmCloseBooking = window.confirm(
            `${date}: ${proximityLabelFromSeverity(alert.severity)} proximity (${alert.minGapMinutes} min). ${alert.details.join(' ')}\n\nContinue for this date?`,
          )
          if (!confirmCloseBooking) {
            skipped.push(`${date}: skipped by user (${alert.severity} proximity)`)
            continue
          }
        }

        const result = await attemptBooking({
          bookingId: generateUuid(),
          title: title.trim(),
          userName: selectedUser,
          requestedCarOption: selectedRequestedCarOption,
          startDateTime: start,
          endDateTime: end,
          isUrgent: canUseUrgentVeto,
          note: '',
          confirmUrgentOverride: false,
        })

        if (result.decision === 'created' || result.decision === 'created_with_override') {
          createdCount += 1
          continue
        }

        if (result.decision === 'needs_both_cars_decision' || result.decision === 'needs_urgent_confirmation') {
          skipped.push(`${date}: needs manual confirmation (book this one separately)`)
          continue
        }

        skipped.push(`${date}: ${result.message}`)
      }

      await refreshBookings()

      if (createdCount > 0 && skipped.length === 0) {
        setTitle('')
        setSelectedRequestedCarOption('noPreference')
        setIsRecurring(false)
        setRecurringWeekdays([])
        setNotice({ type: 'success', message: `Created ${createdCount} recurring booking(s).` })
        return
      }

      if (createdCount > 0 && skipped.length > 0) {
        setNotice({
          type: 'warning',
          message: `Created ${createdCount} recurring booking(s). Skipped ${skipped.length}: ${skipped.join(' | ')}`,
        })
        return
      }

      setNotice({
        type: 'error',
        message: `No recurring bookings were created. ${skipped.join(' | ') || 'Please review selected days and time range.'}`,
      })
    } catch (error) {
      const message = getErrorMessage(error, 'Could not save recurring bookings. Please try again.')
      setNotice({ type: 'error', message })
    } finally {
      setIsSubmittingBooking(false)
    }
  }

  const submitBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await (isRecurring ? runCreateRecurringBookings() : runCreateBooking(false))
  }

  const findRecurringWeekRelatedBookings = (targetBooking: Booking): Booking[] => {
    const targetTitle = (targetBooking.title ?? '').trim()
    const targetWeekKey = weekKeyFromIso(targetBooking.startDateTime)
    const targetStartTime = timeOfDayFromIso(targetBooking.startDateTime)
    const targetEndTime = timeOfDayFromIso(targetBooking.endDateTime)

    return bookings.filter((booking) => {
      if (booking.id === targetBooking.id) {
        return false
      }
      if (booking.user !== targetBooking.user) {
        return false
      }
      if (booking.status !== targetBooking.status) {
        return false
      }
      if (booking.requestedCarOption !== targetBooking.requestedCarOption) {
        return false
      }
      if (booking.isUrgent !== targetBooking.isUrgent) {
        return false
      }
      if ((booking.title ?? '').trim() !== targetTitle) {
        return false
      }
      if (weekKeyFromIso(booking.startDateTime) !== targetWeekKey) {
        return false
      }
      return timeOfDayFromIso(booking.startDateTime) === targetStartTime &&
        timeOfDayFromIso(booking.endDateTime) === targetEndTime
    })
  }

  const deleteBookingsByIds = async (ids: string[]) => {
    for (const id of ids) {
      await deleteBookingById(id)
    }
  }

  const queueUndoDelete = (deletedBookings: Booking[]) => {
    if (undoDeleteTimerRef.current !== null) {
      window.clearTimeout(undoDeleteTimerRef.current)
    }
    if (undoDeleteIntervalRef.current !== null) {
      window.clearInterval(undoDeleteIntervalRef.current)
    }
    setNotice(null)
    setPendingUndoDelete({ bookings: deletedBookings })
    setUndoSecondsLeft(15)
    undoDeleteIntervalRef.current = window.setInterval(() => {
      setUndoSecondsLeft((current) => {
        if (current <= 1) {
          if (undoDeleteIntervalRef.current !== null) {
            window.clearInterval(undoDeleteIntervalRef.current)
            undoDeleteIntervalRef.current = null
          }
          return 0
        }
        return current - 1
      })
    }, 1000)
    undoDeleteTimerRef.current = window.setTimeout(() => {
      setPendingUndoDelete(null)
      setUndoSecondsLeft(0)
      if (undoDeleteIntervalRef.current !== null) {
        window.clearInterval(undoDeleteIntervalRef.current)
        undoDeleteIntervalRef.current = null
      }
      undoDeleteTimerRef.current = null
    }, 15000)
  }

  const handleDeleteBooking = async (bookingId: string) => {
    const targetBooking = bookings.find((booking) => booking.id === bookingId)
    if (!targetBooking) {
      setNotice({ type: 'error', message: 'Could not find that booking anymore. Please refresh and try again.' })
      return
    }

    const relatedInWeek = findRecurringWeekRelatedBookings(targetBooking)
    if (relatedInWeek.length > 0) {
      const weekStart = getWeekStart(new Date(targetBooking.startDateTime))
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      const weekLabel = `${weekStart.getDate()}.${weekStart.getMonth() + 1} - ${weekEnd.getDate()}.${weekEnd.getMonth() + 1}`

      setPendingRecurringDelete({
        bookingId,
        relatedBookingIds: relatedInWeek.map((booking) => booking.id),
        weekLabel,
      })
      return
    }

    try {
      await deleteBookingById(bookingId)
      await refreshBookings()
      queueUndoDelete([targetBooking])
    } catch {
      setNotice({ type: 'error', message: 'Could not delete booking. Please try again.' })
    }
  }

  const handleDeleteOnlyThisRecurringBooking = async () => {
    if (!pendingRecurringDelete) {
      return
    }
    const bookingId = pendingRecurringDelete.bookingId
    const deletedBooking = bookings.find((booking) => booking.id === bookingId) ?? null
    setPendingRecurringDelete(null)
    try {
      await deleteBookingById(bookingId)
      await refreshBookings()
      if (deletedBooking) {
        queueUndoDelete([deletedBooking])
      }
    } catch {
      setNotice({ type: 'error', message: 'Could not delete booking. Please try again.' })
    }
  }

  const handleDeleteWholeRecurringWeek = async () => {
    if (!pendingRecurringDelete) {
      return
    }
    const idsToDelete = [pendingRecurringDelete.bookingId, ...pendingRecurringDelete.relatedBookingIds]
    const deletedBookings = bookings.filter((booking) => idsToDelete.includes(booking.id))
    setPendingRecurringDelete(null)
    try {
      await deleteBookingsByIds(idsToDelete)
      await refreshBookings()
      if (deletedBookings.length > 0) {
        queueUndoDelete(deletedBookings)
      }
    } catch {
      setNotice({ type: 'error', message: 'Could not delete all recurring bookings. Please try again.' })
    }
  }

  const handleUndoDelete = async () => {
    if (!pendingUndoDelete) {
      return
    }
    const restorePayload = pendingUndoDelete.bookings
    setPendingUndoDelete(null)
    if (undoDeleteTimerRef.current !== null) {
      window.clearTimeout(undoDeleteTimerRef.current)
      undoDeleteTimerRef.current = null
    }
    if (undoDeleteIntervalRef.current !== null) {
      window.clearInterval(undoDeleteIntervalRef.current)
      undoDeleteIntervalRef.current = null
    }
    setUndoSecondsLeft(0)

    try {
      await restoreDeletedBookings(restorePayload)
      await refreshBookings()
      setNotice({ type: 'success', message: 'Deleted booking(s) restored.' })
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error, 'Could not undo delete. Please try again.') })
    }
  }

  const handleDismissUndoDelete = () => {
    setPendingUndoDelete(null)
    if (undoDeleteTimerRef.current !== null) {
      window.clearTimeout(undoDeleteTimerRef.current)
      undoDeleteTimerRef.current = null
    }
    if (undoDeleteIntervalRef.current !== null) {
      window.clearInterval(undoDeleteIntervalRef.current)
      undoDeleteIntervalRef.current = null
    }
    setUndoSecondsLeft(0)
  }

  const handleStartEditBooking = (booking: Booking) => {
    setEditingBooking(booking)
    setNotice(null)
  }

  const runEditBooking = async (
    bookingId: string,
    proposedTitle: string,
    proposedStartDateTime: string,
    proposedEndDateTime: string,
    skipProximityCheck: boolean,
    skipAutoResolution = false,
  ) => {
    const bookingToEdit = bookings.find((booking) => booking.id === bookingId)
    if (!bookingToEdit) {
      setNotice({ type: 'error', message: 'Could not find that booking anymore. Please refresh and try again.' })
      setEditingBooking(null)
      return
    }

    const parsedStart = new Date(proposedStartDateTime)
    const parsedEnd = new Date(proposedEndDateTime)
    if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
      setNotice({ type: 'error', message: 'Please select valid date/time values.' })
      return
    }

    const normalizedStart = parsedStart.toISOString()
    const normalizedEnd = parsedEnd.toISOString()

    if (!isValidDateRange(normalizedStart, normalizedEnd)) {
      setNotice({ type: 'error', message: 'Please choose a valid time range.' })
      return
    }

    const overlapConflicts = getConflicts(
      bookings.filter((booking) => booking.id !== bookingId),
      bookingToEdit.assignedCars,
      normalizedStart,
      normalizedEnd,
    )

    if (overlapConflicts.length > 0) {
      if (!skipAutoResolution) {
        const canUseOverrideForEdit = isParent && bookingToEdit.isUrgent
        const suggestions = buildAutoResolutionSuggestions({
          currentUser: selectedUser,
          canUseOverride: canUseOverrideForEdit,
          requestedCarOption: bookingToEdit.requestedCarOption,
          baseStartDateTime: normalizedStart,
          baseEndDateTime: normalizedEnd,
          excludeBookingId: bookingId,
          originalAssignedCars: bookingToEdit.assignedCars,
          fixedAssignedCars: bookingToEdit.assignedCars,
        })
        if (suggestions.readyNow.length > 0 || suggestions.requiresOverride.length > 0) {
          setPendingAutoResolution({
            action: 'edit',
            bookingId,
            bookingTitle: proposedTitle,
            readyNow: suggestions.readyNow,
            requiresOverride: suggestions.requiresOverride,
            switchCandidates: [],
          })
          return
        }
      }
      setNotice({ type: 'error', message: 'This change overlaps another booking, so it cannot be saved.' })
      return
    }

    if (!skipProximityCheck) {
      const alert = getProximityAlert(
        bookings,
        bookingToEdit.assignedCars,
        normalizedStart,
        normalizedEnd,
        bookingId,
      )
      if (alert) {
        setPendingProximityConfirmation({
          action: 'edit',
          modalTitle: proximityTitleFromSeverity(alert.severity),
          message: `${proximityLabelFromSeverity(alert.severity)} proximity (${alert.minGapMinutes} min). ${alert.details.join(' ')} Continue anyway?`,
          severity: alert.severity,
          bookingId,
          bookingTitle: proposedTitle,
          startDateTime: normalizedStart,
          endDateTime: normalizedEnd,
        })
        return
      }
    }

    setIsSubmittingBooking(true)
    setNotice(null)
    try {
      await updateBookingDetailsById(bookingId, proposedTitle.trim(), normalizedStart, normalizedEnd)
      await refreshBookings()
      setEditingBooking(null)
      setNotice({ type: 'success', message: 'Booking updated successfully.' })
    } catch (error) {
      setNotice({
        type: 'error',
        message: getErrorMessage(error, 'Could not update booking. Please try again.'),
      })
    } finally {
      setIsSubmittingBooking(false)
    }
  }

  const handleSaveBookingEdit = async (proposedTitle: string, proposedStartDateTime: string, proposedEndDateTime: string) => {
    if (!editingBooking) {
      return
    }
    await runEditBooking(editingBooking.id, proposedTitle, proposedStartDateTime, proposedEndDateTime, false)
  }

  const handleCancelBookingEdit = () => {
    setEditingBooking(null)
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
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error, 'Could not save booking. Please try again.') })
    } finally {
      setIsSubmittingBooking(false)
    }
  }

  const handleCancelUrgentOverride = () => {
    setPendingUrgentConfirmation(null)
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

  const handleConfirmProximity = async () => {
    if (!pendingProximityConfirmation) {
      return
    }

    const action = pendingProximityConfirmation
    setPendingProximityConfirmation(null)

    if (action.action === 'new') {
      await runCreateBooking(true)
      return
    }

    await runEditBooking(action.bookingId, action.bookingTitle, action.startDateTime, action.endDateTime, true)
  }

  const handleCancelProximity = () => {
    setPendingProximityConfirmation(null)
  }

  const handleApplyAutoResolutionOption = async (option: AutoResolutionOption) => {
    if (!pendingAutoResolution) {
      return
    }

    if (pendingAutoResolution.action === 'new') {
      const { date, time: start } = splitDateTimeValue(option.startDateTime)
      const { time: end } = splitDateTimeValue(option.endDateTime)
      setBookingDate(date)
      setStartTime(start)
      setEndTime(end)
      setSelectedRequestedCarOption(option.requestedCarOption)
      setPendingAutoResolution(null)
      setIsSubmittingBooking(true)
      setNotice(null)
      try {
        const attemptInput: AttemptBookingInput = {
          bookingId: generateUuid(),
          title: title.trim(),
          userName: selectedUser,
          requestedCarOption: option.requestedCarOption,
          startDateTime: option.startDateTime,
          endDateTime: option.endDateTime,
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
          const computedConflicts = buildUrgentConflictCandidates(
            getConflicts(bookings, option.assignedCars, option.startDateTime, option.endDateTime),
          )
          const conflictsForSelection = result.conflictingBookings?.length
            ? result.conflictingBookings
            : computedConflicts

          setPendingUrgentConfirmation({
            attemptInput,
            conflicts: conflictsForSelection,
            selectedConflictId: conflictsForSelection[0]?.id ?? null,
          })
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
      } catch (error) {
        const message = getErrorMessage(error, 'Could not save booking. Please try again.')
        setNotice({ type: 'error', message })
      } finally {
        setIsSubmittingBooking(false)
      }
      return
    }

    setPendingAutoResolution(null)
    await runEditBooking(
      pendingAutoResolution.bookingId,
      pendingAutoResolution.bookingTitle,
      option.startDateTime,
      option.endDateTime,
      false,
      true,
    )
  }

  const handleKeepOriginalAfterAutoResolution = () => {
    if (!pendingAutoResolution) {
      return
    }
    setPendingAutoResolution(null)
  }

  const handleRequestCarSwitch = async (candidate: CarSwitchCandidate) => {
    const duplicatePending = carSwitchRequests.some((request) =>
      request.status === 'pending' &&
      request.requesterName === selectedUser &&
      request.requestedBookingId === candidate.requestedBookingId &&
      request.requesterStartDateTime === candidate.requesterStartDateTime &&
      request.requesterEndDateTime === candidate.requesterEndDateTime,
    )
    if (duplicatePending) {
      setNotice({ type: 'warning', message: 'A switch request for this slot is already pending.' })
      return
    }

    setIsSubmittingBooking(true)
    try {
      const payload: CreateCarSwitchRequestInput = {
        requesterName: selectedUser,
        requestedUserName: candidate.requestedUserName,
        requesterBookingId: generateUuid(),
        requesterTitle: title.trim(),
        requesterRequestedCarOption: candidate.requesterRequestedCarOption,
        requesterStartDateTime: candidate.requesterStartDateTime,
        requesterEndDateTime: candidate.requesterEndDateTime,
        requestedBookingId: candidate.requestedBookingId,
        requestedCurrentCar: candidate.requestedCurrentCar,
        requestedTargetCar: candidate.requestedTargetCar,
        expiresAt: candidate.expiresAt,
      }
      await createCarSwitchRequest(payload)
      setPendingAutoResolution(null)
      await refreshBookings()
      setSwitchMessagePayload({
        recipientName: candidate.requestedUserName,
        message: candidate.whatsappMessage,
      })
      setNotice({
        type: 'success',
        message: `Switch request sent to ${candidate.requestedUserName}. It will expire automatically if not approved in time.`,
      })
    } catch (error) {
      setNotice({
        type: 'error',
        message: getErrorMessage(error, 'Could not send switch request. Please try again.'),
      })
    } finally {
      setIsSubmittingBooking(false)
    }
  }

  const handleApproveCarSwitchRequest = async (request: CarSwitchRequest) => {
    setIsSubmittingBooking(true)
    try {
      await approveAndApplyCarSwitchRequest(request)
      await refreshBookings()
      setNotice({
        type: 'success',
        message: `Switch approved. ${request.requesterName}'s booking was created and your booking was moved to ${request.requestedTargetCar}.`,
      })
    } catch (error) {
      setNotice({
        type: 'error',
        message: getErrorMessage(error, 'Could not apply switch request.'),
      })
      await refreshBookings()
    } finally {
      setIsSubmittingBooking(false)
    }
  }

  const handleDeclineCarSwitchRequest = async (requestId: string) => {
    try {
      await updateCarSwitchRequestStatus(requestId, 'declined')
      await refreshBookings()
      setNotice({ type: 'warning', message: 'Switch request declined.' })
    } catch (error) {
      setNotice({
        type: 'error',
        message: getErrorMessage(error, 'Could not decline switch request.'),
      })
    }
  }

  const handleCancelCarSwitchRequest = async (requestId: string) => {
    try {
      await updateCarSwitchRequestStatus(requestId, 'cancelled')
      await refreshBookings()
      setNotice({ type: 'warning', message: 'Switch request cancelled.' })
    } catch (error) {
      setNotice({
        type: 'error',
        message: getErrorMessage(error, 'Could not cancel switch request.'),
      })
    }
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
        isRecurring: boolean
        recurringWeekdays: number[]
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
    if (key === 'isRecurring') {
      const nextIsRecurring = value as boolean
      setIsRecurring(nextIsRecurring)
      if (nextIsRecurring) {
        const selectedDate = new Date(`${bookingDate}T00:00:00`)
        if (!Number.isNaN(selectedDate.getTime())) {
          setRecurringWeekdays([selectedDate.getDay()])
        }
      } else {
        setRecurringWeekdays([])
      }
      return
    }
    if (key === 'recurringWeekdays') {
      setRecurringWeekdays(value as number[])
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

      {pendingUndoDelete && (
        <section className="app-notice warning" role="status">
          <p>
            {pendingUndoDelete.bookings.length > 1
              ? `Deleted ${pendingUndoDelete.bookings.length} bookings.`
              : 'Booking deleted.'}{' '}
            Undo in {undoSecondsLeft}s?
          </p>
          <div className="undo-delete-actions">
            <button type="button" onClick={handleUndoDelete}>Undo</button>
            <button type="button" onClick={handleDismissUndoDelete}>Dismiss</button>
          </div>
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

      {incomingPendingSwitchRequests.map((request) => (
        <section key={request.id} className="app-notice warning" role="status">
          <p>
            {request.requesterName} asks you to switch your car from {request.requestedCurrentCar} to {request.requestedTargetCar}{' '}
            ({formatTime(request.requesterStartDateTime)}-{formatTime(request.requesterEndDateTime)}). Expires at{' '}
            {formatDateTime(request.expiresAt)}.
          </p>
          <div className="undo-delete-actions">
            <button type="button" onClick={() => void handleApproveCarSwitchRequest(request)}>Approve & apply</button>
            <button type="button" onClick={() => void handleDeclineCarSwitchRequest(request.id)}>Decline</button>
          </div>
        </section>
      ))}

      {outgoingPendingSwitchRequests.map((request) => (
        <section key={request.id} className="app-notice" role="status">
          <p>
            Waiting for {request.requestedUserName} to approve car switch ({formatTime(request.requesterStartDateTime)}-
            {formatTime(request.requesterEndDateTime)}). Expires at {formatDateTime(request.expiresAt)}.
          </p>
          <div className="undo-delete-actions">
            <button type="button" onClick={() => void handleCancelCarSwitchRequest(request.id)}>Cancel request</button>
          </div>
        </section>
      ))}


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
                isRecurring,
                recurringWeekdays,
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
              onEditBooking={handleStartEditBooking}
            />
          </ViewShell>
        )}

        {!isLoadingBookings && activeView === 'myBookings' && (
          <ViewShell>
            <MyBookings
              currentUser={selectedUser}
              bookings={bookings}
              switchRequests={carSwitchRequests}
              onDeleteBooking={handleDeleteBooking}
              onEditBooking={handleStartEditBooking}
            />
          </ViewShell>
        )}
      </section>

      <EditBookingTimeModal
        isOpen={editingBooking !== null}
        booking={editingBooking}
        onCancel={handleCancelBookingEdit}
        onSave={handleSaveBookingEdit}
      />

      <AutoResolutionModal
        isOpen={pendingAutoResolution !== null}
        readyNow={pendingAutoResolution?.readyNow ?? []}
        requiresOverride={pendingAutoResolution?.requiresOverride ?? []}
        switchCandidates={pendingAutoResolution?.switchCandidates ?? []}
        onApply={handleApplyAutoResolutionOption}
        onRequestSwitch={handleRequestCarSwitch}
        onKeepOriginal={handleKeepOriginalAfterAutoResolution}
      />

      <ConfirmModal
        isOpen={pendingProximityConfirmation !== null}
        title={pendingProximityConfirmation
          ? (pendingProximityConfirmation.action === 'new'
              ? pendingProximityConfirmation.title
              : pendingProximityConfirmation.modalTitle)
          : 'Proximity alert'}
        message={pendingProximityConfirmation?.message ?? ''}
        tone={pendingProximityConfirmation?.severity ?? 'default'}
        primaryLabel="Continue"
        secondaryLabel="Go back"
        onPrimary={handleConfirmProximity}
        onSecondary={handleCancelProximity}
      />

      <ConfirmModal
        isOpen={duplicateBookingToMergeId !== null}
        title="Same time booking detected"
        message="You already have a booking at this exact time on a different car. You may want both cars, or this might be a duplicate by mistake."
        primaryLabel="Both cars"
        secondaryLabel="Cancel"
        onPrimary={handleUseBothCarsForDuplicate}
        onSecondary={handleCancelDuplicateMerge}
      />

      <RecurringDeleteModal
        isOpen={pendingRecurringDelete !== null}
        weekLabel={pendingRecurringDelete?.weekLabel ?? ''}
        bookingCount={(pendingRecurringDelete?.relatedBookingIds.length ?? 0) + (pendingRecurringDelete ? 1 : 0)}
        onDeleteOnlyThis={handleDeleteOnlyThisRecurringBooking}
        onDeleteWholeWeek={handleDeleteWholeRecurringWeek}
        onCancel={() => setPendingRecurringDelete(null)}
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

      <SwitchRequestMessageModal
        isOpen={switchMessagePayload !== null}
        recipientName={switchMessagePayload?.recipientName ?? ''}
        message={switchMessagePayload?.message ?? ''}
        onClose={() => setSwitchMessagePayload(null)}
      />

      <UserSelectionModal
        isOpen={isUserSelectionModalOpen}
        onSelectUser={handleSelectCurrentUser}
      />
    </main>
  )
}

export default App
