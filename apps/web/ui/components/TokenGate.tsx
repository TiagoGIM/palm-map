import { useEffect, useMemo, useState } from 'react'
import { Button } from '../primitives/Button'

type TokenGateProps = {
  open: boolean
  token: string | null
  onSave: (value: string) => void
  onRequestClose?: () => void
}

export function TokenGate({ open, token, onSave, onRequestClose }: TokenGateProps) {
  const [draft, setDraft] = useState(token ?? '')
  const [editing, setEditing] = useState(!token)

  useEffect(() => {
    setDraft(token ?? '')
    setEditing(!token)
  }, [token, open])

  const isValid = useMemo(() => draft.trim().length > 0, [draft])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
      <div className="w-full max-w-lg rounded-xl bg-surface p-6 shadow-2">
        <h2 className="text-lg font-semibold">Sessão protegida</h2>
        <p className="mt-2 text-sm text-onsurface/70">
          Cole o token que libera o acesso ao Palm Map. O token será salvo no navegador e usado
          em todas as chamadas à API.
        </p>
        <div className="mt-4 space-y-2">
          {editing ? (
            <label className="flex flex-col gap-2 text-sm">
              <span>Token</span>
              <input
                className="w-full rounded-md border border-outline bg-transparent px-3 py-2 text-sm focus:border-primary focus:outline-none"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="coloque o token aqui"
              />
            </label>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-outline bg-gray-50/70 px-3 py-2 text-sm">
              <span className="text-xs text-onsurface/80">Token salvo</span>
              <Button variant="text" onClick={() => setEditing(true)}>
                Trocar token
              </Button>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          {token && !editing ? (
            <Button variant="text" onClick={() => onRequestClose?.()}>Fechar</Button>
          ) : null}
          <Button
            variant="tonal"
            disabled={!editing || !isValid}
            onClick={() => {
              if (editing && isValid) {
                onSave(draft.trim())
              }
            }}
          >
            Salvar token
          </Button>
        </div>
      </div>
    </div>
  )
}
