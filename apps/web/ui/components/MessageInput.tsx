import type { KeyboardEvent } from 'react'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'

type Props = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  isSubmitting: boolean
  error: string | null
}

export function MessageInput({ value, onChange, onSubmit, onKeyDown, isSubmitting, error }: Props) {
  return (
    <Card>
      <div className="trip-form">
        <label className="grid gap-2 text-sm">
          <span>Mensagem</span>
          <textarea
            className="w-full rounded-sm border border-black/20 bg-surface px-3 py-2 text-sm text-onsurface"
            name="message"
            placeholder="Ex: Quero viajar de Natal para Aracaju por 8 dias, passando 2 dias em Maceio."
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </label>

        <Button disabled={isSubmitting || value.trim() === ''} onClick={onSubmit}>
          {isSubmitting ? 'Enviando...' : 'Enviar'}
        </Button>

        {error ? <p className="error-note" role="alert">{error}</p> : null}
      </div>
    </Card>
  )
}
