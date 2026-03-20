import type { FormEvent } from 'react'
import { useState } from 'react'

import type { PlanTripInput, PlanTripResult } from '../../packages/shared-types'
import { requestPlanTrip } from './plan-trip-api'
import { PlanTripResultView } from './plan-trip-result'
import { AppBar } from './ui/navigation/AppBar'
import { Button } from './ui/primitives/Button'
import { Card } from './ui/primitives/Card'
import { Input } from './ui/primitives/Input'

const initialForm: PlanTripInput = {
  origin: '',
  destination: '',
  days: 1,
  preferencesText: '',
}

export function App() {
  const [form, setForm] = useState<PlanTripInput>(initialForm)
  const [result, setResult] = useState<PlanTripResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const nextResult = await requestPlanTrip({
        ...form,
        preferencesText: form.preferencesText?.trim() || undefined,
      })

      setResult(nextResult)
    } catch (caughtError) {
      setResult(null)
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Nao foi possivel gerar o roteiro.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="app-shell">
      <AppBar title="Palm Map">
        <span className="text-xs text-onsurface/70">MVP</span>
      </AppBar>

      <Card>
        <form className="trip-form" onSubmit={handleSubmit}>
          <Input
            label="Origem"
            name="origin"
            value={form.origin}
            onChange={(event) =>
              setForm((current) => ({ ...current, origin: event.target.value }))
            }
          />

          <Input
            label="Destino"
            name="destination"
            value={form.destination}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                destination: event.target.value,
              }))
            }
          />

          <Input
            label="Dias"
            min="1"
            name="days"
            type="number"
            value={form.days}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                days: Number(event.target.value) || 1,
              }))
            }
          />

          <label className="grid gap-2 text-sm">
            <span>Preferencias</span>
            <textarea
              className="w-full rounded-sm border border-black/20 bg-surface px-3 py-2 text-sm text-onsurface"
              name="preferencesText"
              value={form.preferencesText ?? ''}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  preferencesText: event.target.value,
                }))
              }
            />
          </label>

          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Gerando...' : 'Gerar roteiro'}
          </Button>
        </form>
      </Card>

      {error ? <p className="error-note" role="alert">{error}</p> : null}
      {result ? <PlanTripResultView result={result} /> : null}
    </main>
  )
}
