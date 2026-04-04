import type { CarId, FamilyMember, RequestedCarOption } from '../types'

type ProximitySeverity = 'low' | 'medium' | 'high'
type AutoResolutionOption = {
  id: string
  mode: 'ready' | 'override'
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

type AutoResolutionModalProps = {
  isOpen: boolean
  readyNow: AutoResolutionOption[]
  requiresOverride: AutoResolutionOption[]
  switchCandidates: CarSwitchCandidate[]
  onApply: (option: AutoResolutionOption) => void | Promise<void>
  onRequestSwitch: (candidate: CarSwitchCandidate) => void | Promise<void>
  onKeepOriginal: () => void
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function labelForCars(assignedCars: CarId[]): string {
  if (assignedCars.includes('white') && assignedCars.includes('red')) {
    return 'Both cars'
  }
  return assignedCars[0] === 'red' ? 'Red' : 'White'
}

export default function AutoResolutionModal({
  isOpen,
  readyNow,
  requiresOverride,
  switchCandidates,
  onApply,
  onRequestSwitch,
  onKeepOriginal,
}: AutoResolutionModalProps) {
  if (!isOpen) {
    return null
  }

  const hasSuggestions = readyNow.length > 0 || requiresOverride.length > 0 || switchCandidates.length > 0

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Best alternatives">
      <div className="modal-card auto-resolution-modal">
        <h3>Best alternatives</h3>
        {!hasSuggestions && <p>No strong alternatives found for this time. Keep your original request and adjust manually.</p>}

        {readyNow.length > 0 && (
          <div className="auto-resolution-group">
            <h4>Ready now</h4>
            <ul className="auto-resolution-list">
              {readyNow.map((option) => (
                <li key={option.id} className="auto-resolution-item">
                  <div>
                    <strong>{formatTime(option.startDateTime)} - {formatTime(option.endDateTime)}</strong>
                    <p>Car: {labelForCars(option.assignedCars)}</p>
                    {option.proximitySeverity && (
                      <p className={`auto-resolution-proximity ${option.proximitySeverity}`}>
                        {option.proximitySeverity.toUpperCase()} proximity ({option.proximityGapMinutes} min)
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="modal-primary assistant-action-btn"
                    onClick={() => onApply(option)}
                  >
                    Apply
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {requiresOverride.length > 0 && (
          <div className="auto-resolution-group">
            <h4>Requires urgent override</h4>
            <ul className="auto-resolution-list">
              {requiresOverride.map((option) => (
                <li key={option.id} className="auto-resolution-item override">
                  <div>
                    <strong>{formatTime(option.startDateTime)} - {formatTime(option.endDateTime)}</strong>
                    <p>Car: {labelForCars(option.assignedCars)}</p>
                    {option.overrideImpacts.length > 0 && (
                      <p>
                        Will override: {option.overrideImpacts.map((impact) =>
                          `${impact.user} (${formatTime(impact.startDateTime)}-${formatTime(impact.endDateTime)})`).join(', ')}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="modal-primary assistant-action-btn"
                    onClick={() => onApply(option)}
                  >
                    Apply
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {switchCandidates.length > 0 && (
          <div className="auto-resolution-group">
            <h4>Exact time via switch request</h4>
            <ul className="auto-resolution-list">
              {switchCandidates.map((candidate) => (
                <li key={candidate.id} className="auto-resolution-item">
                  <div>
                    <strong>{formatTime(candidate.requesterStartDateTime)} - {formatTime(candidate.requesterEndDateTime)}</strong>
                    <p>
                      Ask {candidate.requestedUserName} to switch from {candidate.requestedCurrentCar} to {candidate.requestedTargetCar}.
                    </p>
                    <p>Expires at {formatTime(candidate.expiresAt)}.</p>
                  </div>
                  <button
                    type="button"
                    className="modal-primary assistant-action-btn assistant-action-btn--switch"
                    onClick={() => onRequestSwitch(candidate)}
                  >
                    Request switch
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="modal-secondary" onClick={onKeepOriginal}>
            Keep original request
          </button>
        </div>
      </div>
    </div>
  )
}
