import type { CarId, RequestedCarOption } from '../types'

type AutoResolutionOption = {
  id: string
  startDateTime: string
  endDateTime: string
  requestedCarOption: RequestedCarOption
  assignedCars: CarId[]
}

type SwitchInterimSelectionModalProps = {
  isOpen: boolean
  options: AutoResolutionOption[]
  onSelectOption: (option: AutoResolutionOption) => void | Promise<void>
  onSkip: () => void | Promise<void>
  onCancel: () => void
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

export default function SwitchInterimSelectionModal({
  isOpen,
  options,
  onSelectOption,
  onSkip,
  onCancel,
}: SwitchInterimSelectionModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Meantime booking selection">
      <div className="modal-card">
        <h3>Meantime booking</h3>
        <p>Choose an interim booking while waiting for switch approval, or continue without one.</p>
        <ul className="auto-resolution-list">
          {options.map((option) => (
            <li key={option.id} className="auto-resolution-item">
              <div>
                <strong>{formatTime(option.startDateTime)} - {formatTime(option.endDateTime)}</strong>
                <p>Car: {labelForCars(option.assignedCars)}</p>
              </div>
              <button
                type="button"
                className="modal-primary assistant-action-btn assistant-action-btn--interim"
                onClick={() => onSelectOption(option)}
              >
                Use this
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button type="button" className="modal-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="modal-primary assistant-action-btn assistant-action-btn--subtle" onClick={onSkip}>
            Continue without interim
          </button>
        </div>
      </div>
    </div>
  )
}
