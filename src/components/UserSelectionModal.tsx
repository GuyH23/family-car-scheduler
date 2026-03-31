import type { FamilyMember } from '../types'
import { FAMILY_MEMBERS } from '../types'

type UserSelectionModalProps = {
  isOpen: boolean
  onSelectUser: (user: FamilyMember) => void
}

export default function UserSelectionModal({ isOpen, onSelectUser }: UserSelectionModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Select current user">
      <div className="modal-card">
        <h3>מי משתמש באפליקציה כרגע?</h3>
        <div className="user-select-grid">
          {FAMILY_MEMBERS.map((member) => (
            <button
              key={member}
              type="button"
              className="user-select-btn"
              onClick={() => onSelectUser(member)}
            >
              {member}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
