import { useMemo } from 'react'
import type { ConversationMeta, TripLeg, TripState } from '../../../../packages/shared-types'
import type { PlanNode } from '../../hooks/useConversation'
import { Button } from '../primitives/Button'

type Props = {
  tripState: TripState
  nextQuestionBanner?: string
  conversationMeta?: ConversationMeta
  currentTripLegs?: TripLeg[]
  planNodes: PlanNode[]
  onOpenOverview: () => void
}

export function TripStatePanel({
  tripState,
  nextQuestionBanner,
  conversationMeta,
  currentTripLegs,
  planNodes,
  onOpenOverview,
}: Props) {
  const savedPlacesMap = useMemo(() => {
    const map = new Map<string, string[]>()
    tripState.savedPlacesByCity.forEach((entry) => {
      if (!entry.city || entry.places.length === 0) return
      const names = entry.places
        .map((p) => p.placeName?.trim())
        .filter((n): n is string => Boolean(n))
      if (names.length > 0) map.set(entry.city.toLowerCase(), names)
    })
    return map
  }, [tripState])

  return (
    <section aria-label="Resumo do estado" className="state-summary">
      <div className="state-card">
        <p className="state-card__label">Próxima pergunta</p>
        <p className="state-card__value">
          {nextQuestionBanner ?? 'Nenhuma pergunta pendente'}
        </p>
      </div>

      <div className="state-card">
        <p className="state-card__label">Preferências ativas</p>
        <div className="state-card__chips">
          {tripState.preferences.likes.map((like) => (
            <span className="state-chip" key={`like-${like}`}>{like}</span>
          ))}
          {tripState.preferences.dislikes.map((dislike) => (
            <span className="state-chip" key={`dislike-${dislike}`}>{dislike}</span>
          ))}
          {!tripState.preferences.likes.length && !tripState.preferences.dislikes.length && (
            <span className="state-chip state-chip--muted">Nenhuma preferência registrada</span>
          )}
        </div>
        <p className="state-card__meta">
          {conversationMeta?.preferencesReused === true
            ? 'Preferências reaproveitadas do contexto'
            : conversationMeta?.preferencesReused === false
            ? 'Preferências atualizadas nesta rodada'
            : tripState.preferences.likes.length + tripState.preferences.dislikes.length > 0
            ? 'Preferências registradas'
            : 'Sem preferências explícitas até agora'}
        </p>
      </div>

      <div className="state-card">
        <p className="state-card__label">Trip legs</p>
        {currentTripLegs && currentTripLegs.length > 0 ? (
          <ul className="trip-legs-list">
            {currentTripLegs.map((leg) => (
              <li key={`leg-${leg.order}`} className="trip-leg">
                <strong>{leg.order}. {leg.fromCity} → {leg.toCity}</strong>
                {leg.stayDaysAtDestination ? (
                  <span className="trip-leg__meta">{leg.stayDaysAtDestination} dias</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="state-card__meta">Aguardando sugestões grounded</p>
        )}
      </div>

      <div className="state-card plan-card">
        <p className="state-card__label">Plano por cidade</p>
        {planNodes.length > 0 ? (
          <ol className="plan-city-list">
            {planNodes.map((node) => {
              const savedList = savedPlacesMap.get(node.city.toLowerCase())
              return (
                <li key={`${node.role}-${node.city}`} className="plan-city-entry">
                  <div className="plan-city-header">
                    <span className="plan-city-role">
                      {node.role === 'origin' ? 'Origem' : node.role === 'destination' ? 'Destino' : 'Parada'}
                    </span>
                    <strong className="plan-city-name">{node.city}</strong>
                    {node.stayDays ? (
                      <span className="plan-city-stay">{node.stayDays} dias</span>
                    ) : null}
                  </div>
                  <p className={savedList ? 'plan-city-saved' : 'plan-city-saved plan-city-saved--muted'}>
                    {savedList ? `Lugares salvos: ${savedList.join(', ')}` : 'Nenhum lugar salvo para esta cidade'}
                  </p>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="state-card__meta">Compartilhe origem e destino para montar o plano.</p>
        )}
      </div>

      {conversationMeta?.unresolvedFields && conversationMeta.unresolvedFields.length > 0 ? (
        <div className="state-card">
          <p className="state-card__label">Campos pendentes</p>
          <div className="state-card__chips">
            {conversationMeta.unresolvedFields.map((field) => (
              <span className="state-chip" key={`unresolved-${field}`}>{field}</span>
            ))}
          </div>
        </div>
      ) : null}

      {conversationMeta?.conversationStage ? (
        <div className="state-card state-card--stage">
          <p className="state-card__label">Fase da conversa</p>
          <p className="state-card__value">{conversationMeta.conversationStage.replace('_', ' ')}</p>
          {conversationMeta.currentFocusCity ? (
            <p className="state-card__meta">Foco atual: {conversationMeta.currentFocusCity}</p>
          ) : null}
        </div>
      ) : null}

      <div className="state-summary__actions">
        <Button variant="tonal" onClick={onOpenOverview} disabled={false}>
          Minha Trip
        </Button>
      </div>
    </section>
  )
}
