export type FamilyMember = 'Dad' | 'Mom' | 'Noa' | 'Yuval'
export type CarId = 'white' | 'red'
export type CarFilter = CarId | 'both'
export type BookingStatus = 'active' | 'overridden'
export type RequestedCarOption = 'white' | 'red' | 'noPreference' | 'bothCars'

export type Booking = {
  id: string
  title?: string
  user: FamilyMember
  requestedCarOption: RequestedCarOption
  assignedCars: CarId[]
  startDateTime: string
  endDateTime: string
  isUrgent: boolean
  note?: string
  status: BookingStatus
  overriddenByBookingId?: string
  notified?: boolean
  createdAt: string
}

export const FAMILY_MEMBERS: FamilyMember[] = ['Dad', 'Mom', 'Noa', 'Yuval']
export const PARENTS: FamilyMember[] = ['Dad', 'Mom']

export const CARS: Record<CarId, string> = {
  white: 'White (Toyota Corolla)',
  red: 'Red (Mazda 2)',
}

export const REQUESTED_CAR_OPTIONS: Array<{ value: RequestedCarOption; label: string }> = [
  { value: 'white', label: 'White' },
  { value: 'red', label: 'Red' },
  { value: 'noPreference', label: 'No preference' },
  { value: 'bothCars', label: 'Both cars' },
]
