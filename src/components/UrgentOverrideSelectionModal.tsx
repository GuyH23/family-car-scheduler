import type { UrgentConflictCandidate } from '../services/bookingsService'
import { formatDateTime, labelForAssignedCars } from '../utils/bookingUtils'

type UrgentOverrideSelectionModalProps = {
  isOpen: boolean
  conflicts: UrgentConflictCandidate[]
  selectedIds: string[]
  onToggle: (bookingId: string, checked: boolean) => void
  onConfirm: () => void
  onCancel: () => void
}

export default function UrgentOverrideSelectionModal({
  isOpen,
  conflicts,
  selectedIds,
  onToggle,
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
        <p>Select which conflicting bookings should be overridden by this urgent request.</p>

        <ul className="override-selection-list">
          {conflicts.map((conflict) => {
            const isSelected = selectedIds.includes(conflict.id)
            const title = conflict.title.trim()
            return (
              <li key={conflict.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(event) => onToggle(conflict.id, event.target.checked)}
                  />
                  <span>
                    <strong>{conflict.userName}</strong> - {labelForAssignedCars(conflict.assignedCars)}<br />
                    {formatDateTime(conflict.startDateTime)} - {formatDateTime(conflict.endDateTime)}
                    {title ? ` (${title})` : ''}
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
          <button type="button" className="modal-primary" onClick={onConfirm} disabled={selectedIds.length === 0}>
            Override selected
          </button>
        </div>
      </div>
    </div>
  )
}
