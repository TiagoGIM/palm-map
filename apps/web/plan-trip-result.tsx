import type { PlanTripResult } from '../../packages/shared-types'
import { Chip } from './ui/primitives/Chip'
import { Card } from './ui/primitives/Card'

type PlanTripResultProps = {
  result: PlanTripResult
}

export function PlanTripResultView({ result }: PlanTripResultProps) {
  return (
    <section aria-label="Resultado do roteiro" className="trip-result">
      {result.effectivePreferencesText ? (
        <p className="effective-pref-note">
          <Chip variant="outline">
            Preferencia usada: {result.effectivePreferencesText}
          </Chip>
        </p>
      ) : null}

      {result.warnings && result.warnings.length > 0 ? (
        <section aria-label="Avisos do roteiro" className="warnings-box">
          <h2>Avisos</h2>
          <ul className="warnings-list">
            {result.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.days.map((day) => (
        <Card key={day.day} aria-label={`Dia ${day.day}`} className="day-card">
          <h2>Dia {day.day}</h2>
          <ul className="day-items">
            {day.items.map((item) => (
              <li key={`${day.day}-${item.name}`}>
                <strong>{item.name}</strong>
                <div>{item.location}</div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </section>
  )
}
