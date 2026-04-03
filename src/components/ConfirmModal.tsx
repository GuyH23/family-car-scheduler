type ConfirmModalProps = {
  isOpen: boolean
  title: string
  message: string
  tone?: 'default' | 'low' | 'medium' | 'high'
  primaryLabel: string
  secondaryLabel: string
  onPrimary: () => void
  onSecondary: () => void
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  tone = 'default',
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: ConfirmModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`modal-card modal-card--${tone}`}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" className="modal-secondary" onClick={onSecondary}>
            {secondaryLabel}
          </button>
          <button type="button" className="modal-primary" onClick={onPrimary}>
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
