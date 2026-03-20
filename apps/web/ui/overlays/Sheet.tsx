import type { PropsWithChildren } from 'react'

type SheetProps = PropsWithChildren<{
  open: boolean
  title?: string
  onClose: () => void
}>

export function Sheet({ children, onClose, open, title }: SheetProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-20 bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="mt-auto rounded-lg bg-surface p-4 shadow-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="m-0 text-base font-semibold">{title ?? 'Detalhes'}</h2>
          <button type="button" onClick={onClose} className="rounded-sm px-2 py-1 text-sm">
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
