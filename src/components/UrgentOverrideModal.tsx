import { useEffect, useState } from 'react'

type UrgentOverrideModalProps = {
  isOpen: boolean
  affectedName: string
  message: string
  onClose: () => void
}

export default function UrgentOverrideModal({
  isOpen,
  affectedName,
  message,
  onClose,
}: UrgentOverrideModalProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setCopied(false)
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Override notification">
      <div className="modal-card">
        <h3>Urgent override completed</h3>
        <p>
          The booking of <strong>{affectedName}</strong> was overridden.
          Please copy the message and send it manually (for example via WhatsApp).
        </p>

        <pre className="copy-message-box">{message}</pre>

        <div className="modal-actions">
          <button type="button" className="modal-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="modal-primary" onClick={handleCopy}>
            Copy message
          </button>
        </div>

        {copied && <p className="copy-feedback">ההודעה הועתקה</p>}
      </div>
    </div>
  )
}
