type RecurringDeleteModalProps = {
  isOpen: boolean
  weekLabel: string
  bookingCount: number
  onDeleteOnlyThis: () => void
  onDeleteWholeWeek: () => void
  onCancel: () => void
}

export default function RecurringDeleteModal({
  isOpen,
  weekLabel,
  bookingCount,
  onDeleteOnlyThis,
  onDeleteWholeWeek,
  onCancel,
}: RecurringDeleteModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Delete recurring booking">
      <div className="modal-card">
        <h3>Delete recurring booking</h3>
        <p>
          This booking looks like part of a recurring week ({weekLabel}). Do you want to delete only this booking
          or all related bookings for that week ({bookingCount} total)?
        </p>
        <div className="modal-actions">
          <button type="button" className="modal-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="modal-secondary" onClick={onDeleteOnlyThis}>
            Only this booking
          </button>
          <button type="button" className="modal-primary" onClick={onDeleteWholeWeek}>
            Whole recurring week
          </button>
        </div>
      </div>
    </div>
  )
}
