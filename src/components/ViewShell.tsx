import type { ReactNode } from 'react'

type ViewShellProps = {
  children: ReactNode
}

export default function ViewShell({ children }: ViewShellProps) {
  return <section className="view-shell">{children}</section>
}
