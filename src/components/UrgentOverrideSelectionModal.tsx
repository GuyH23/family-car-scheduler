import type { UrgentConflictCandidate } from '../services/bookingsService'
import { formatDateTime, labelForAssignedCars } from '../utils/bookingUtils'

type UrgentOverrideSelectionModalProps = {
  isOpen: boolean
  conflicts: UrgentConflictCandidate[]
  selectedId: string | null
  onSelect: (bookingId: string) => void
  onConfirm: () => void
  onCancel: () => void
}

export default function UrgentOverrideSelectionModal({
  isOpen,
  conflicts,
  selectedId,
  onSelect,
  onConfirm,
  onCancel,
}: UrgentOverrideSelectionModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Choose bookings to override">
      <div className="modal-card">
        <h3>Choose bookings to override</h3>
        <p>Select one conflicting booking to override for this urgent request.</p>

        <ul className="override-selection-list">
          {conflicts.map((conflict) => {
            const isSelected = selectedId === conflict.id
            const title = conflict.title.trim()
            return (
              <li key={conflict.id}>
                <label>
                  <input
                    type="radio"
                    name="urgent-override-selection"
                    checked={isSelected}
                    onChange={() => onSelect(conflict.id)}
                  />
                  <span>
                    <strong>{conflict.userName}</strong> - {labelForAssignedCars(conflict.assignedCars)}<br />
                    {title ? <strong>Title: {title}</strong> : 'No title'}
                    <br />
                    {formatDateTime(conflict.startDateTime)} - {formatDateTime(conflict.endDateTime)}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>

        <div className="modal-actions">
          <button type="button" className="modal-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="modal-primary" onClick={onConfirm} disabled={!selectedId}>
            Override selected booking
          </button>
        </div>
      </div>
    </div>
  )
}
