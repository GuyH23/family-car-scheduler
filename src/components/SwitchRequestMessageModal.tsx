import { useEffect, useState } from 'react'

type SwitchRequestMessageModalProps = {
  isOpen: boolean
  recipientName: string
  message: string
  onClose: () => void
}

export default function SwitchRequestMessageModal({
  isOpen,
  recipientName,
  message,
  onClose,
}: SwitchRequestMessageModalProps) {
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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Switch request message">
      <div className="modal-card">
        <h3>Car switch request created</h3>
        <p>
          Copy and send this message to <strong>{recipientName}</strong>.
        </p>

        <pre className="copy-message-box copy-message-box--ltr">{message}</pre>

        <div className="modal-actions">
          <button type="button" className="modal-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="modal-primary" onClick={handleCopy}>
            Copy message
          </button>
        </div>

        {copied && <p className="copy-feedback">Message copied</p>}
      </div>
    </div>
  )
}
