import type { KeyboardEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  ConversationMeta,
  GroundedSuggestions,
  SuggestedRoute,
  TripLeg,
  TripState,
} from '../../packages/shared-types'
import { requestConversationUpdate } from './conversation-update-api'
import { AppBar } from './ui/navigation/AppBar'
import { Button } from './ui/primitives/Button'
import { Card } from './ui/primitives/Card'
import { TripOverviewSheet } from './ui/components/TripOverviewSheet'

type ConversationMessage = {
  id: string
  role: 'user' | 'system'
  text: string
  nextQuestion?: string
  suggestedRoute?: SuggestedRoute
  groundedSuggestions?: GroundedSuggestions
}

export function App() {
  const feedScrollRef = useRef<HTMLElement | null>(null)
  const [tripState, setTripState] = useState<TripState | undefined>(undefined)
  const [draftMessage, setDraftMessage] = useState('')
  const [messages, setMessages] = useState<ConversationMessage[]>([
    {
      id: 'system-initial',
      role: 'system',
      text: 'Me conte sua viagem em linguagem natural. Ex: "Quero viajar de Natal para Aracaju por 8 dias".',
    },
  ])
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nextQuestionBanner, setNextQuestionBanner] = useState<string | undefined>(
    undefined,
  )
  const [currentTripLegs, setCurrentTripLegs] = useState<TripLeg[] | undefined>()
  const [conversationMeta, setConversationMeta] =
    useState<ConversationMeta | undefined>()
  const [isTripOverviewOpen, setTripOverviewOpen] = useState(false)

  const planNodes = useMemo(() => {
    if (!tripState) {
      return []
    }

    const nodes: { city: string; role: 'origin' | 'stop' | 'destination'; stayDays?: number }[] = []

    if (tripState.origin) {
      nodes.push({ city: tripState.origin, role: 'origin' })
    }

    tripState.stops.forEach((stop) => {
      if (stop?.city) {
        nodes.push({ city: stop.city, role: 'stop', stayDays: stop.stayDays })
      }
    })

    if (tripState.destination) {
      nodes.push({ city: tripState.destination, role: 'destination' })
    }

    return nodes
  }, [tripState])

  const savedPlacesMap = useMemo(() => {
    const map = new Map<string, string[]>()
    if (!tripState) {
      return map
    }

    tripState.savedPlacesByCity.forEach((entry) => {
      if (!entry.city || entry.places.length === 0) {
        return
      }

      const normalizedPlaces = entry.places
        .map((place) => place.placeName?.trim())
        .filter((name): name is string => Boolean(name))

      if (normalizedPlaces.length > 0) {
        map.set(entry.city.toLowerCase(), normalizedPlaces)
      }
    })

    return map
  }, [tripState])

  useEffect(() => {
    if (!feedScrollRef.current) {
      return
    }

    feedScrollRef.current.scrollTop = feedScrollRef.current.scrollHeight
  }, [messages, isSubmitting])

  useEffect(() => {
    if (!tripState) {
      setTripOverviewOpen(false)
    }
  }, [tripState])

  async function handleSubmit(rawMessage?: string) {
    const message = (rawMessage ?? draftMessage).trim()
    if (!message || isSubmitting) {
      return
    }

    const userMessage: ConversationMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: message,
    }

    if (!rawMessage) {
      setDraftMessage('')
    }
    setMessages((current) => [...current, userMessage])
    setIsSubmitting(true)
    setError(null)

    try {
      const result = await requestConversationUpdate({
        message,
        tripState,
      })

      setTripState(result.tripState)
      setNextQuestionBanner(result.nextQuestion)
      setCurrentTripLegs(result.tripLegs)
      setConversationMeta(result.tripState.conversationMeta)
      setMessages((current) => [
        ...current,
        {
          id: `system-${Date.now()}`,
          role: 'system',
          text: result.assistantMessage ?? buildSystemText(result.tripState),
          nextQuestion: result.nextQuestion,
          suggestedRoute: result.suggestedRoute,
          groundedSuggestions: result.groundedSuggestions,
        },
      ])
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Nao foi possivel atualizar a conversa.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSaveSuggestionOption(rank: number) {
    const command = `salva a ${rank} opcao`
    await handleSubmit(command)
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }

    event.preventDefault()
    void handleSubmit()
  }

  return (
    <main className="app-shell">
      <AppBar title="Palm Map">
        <span className="text-xs text-onsurface/70">Conversational MVP</span>
      </AppBar>

      {tripState ? (
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
                <span className="state-chip" key={`like-${like}`}>
                  {like}
                </span>
              ))}
              {tripState.preferences.dislikes.map((dislike) => (
                <span className="state-chip" key={`dislike-${dislike}`}>
                  {dislike}
                </span>
              ))}
              {!tripState.preferences.likes.length &&
                !tripState.preferences.dislikes.length && (
                  <span className="state-chip state-chip--muted">
                    Nenhuma preferência registrada
                  </span>
                )}
            </div>
            <p className="state-card__meta">
              {conversationMeta?.preferencesReused === true
                ? 'Preferências reaproveitadas do contexto'
                : conversationMeta?.preferencesReused === false
                ? 'Preferências atualizadas nesta rodada'
                : tripState.preferences.likes.length +
                    tripState.preferences.dislikes.length >
                  0
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
                    <strong>
                      {leg.order}. {leg.fromCity} → {leg.toCity}
                    </strong>
                    {leg.stayDaysAtDestination ? (
                      <span className="trip-leg__meta">
                        {leg.stayDaysAtDestination} dias
                      </span>
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
                  const cityKey = node.city.toLowerCase()
                  const savedList = savedPlacesMap.get(cityKey)
                  return (
                    <li
                      key={`${node.role}-${node.city}`}
                      className="plan-city-entry"
                    >
                      <div className="plan-city-header">
                        <span className="plan-city-role">
                          {node.role === 'origin'
                            ? 'Origem'
                            : node.role === 'destination'
                              ? 'Destino'
                              : 'Parada'}
                        </span>
                        <strong className="plan-city-name">{node.city}</strong>
                        {node.stayDays ? (
                          <span className="plan-city-stay">
                            {node.stayDays} dias
                          </span>
                        ) : null}
                      </div>
                      <p
                        className={
                          savedList
                            ? 'plan-city-saved'
                            : 'plan-city-saved plan-city-saved--muted'
                        }
                      >
                        {savedList
                          ? `Lugares salvos: ${savedList.join(', ')}`
                          : 'Nenhum lugar salvo para esta cidade'}
                      </p>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="state-card__meta">
                Compartilhe origem e destino para montar o plano.
              </p>
            )}
          </div>

          {conversationMeta?.unresolvedFields &&
          conversationMeta.unresolvedFields.length > 0 ? (
            <div className="state-card">
              <p className="state-card__label">Campos pendentes</p>
              <div className="state-card__chips">
                {conversationMeta.unresolvedFields.map((field) => (
                  <span className="state-chip" key={`unresolved-${field}`}>
                    {field}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {conversationMeta?.conversationStage ? (
            <div className="state-card state-card--stage">
              <p className="state-card__label">Fase da conversa</p>
              <p className="state-card__value">
                {conversationMeta.conversationStage.replace('_', ' ')}
              </p>
              {conversationMeta.currentFocusCity ? (
                <p className="state-card__meta">
                  Foco atual: {conversationMeta.currentFocusCity}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="state-summary__actions">
            <Button
              variant="tonal"
              onClick={() => setTripOverviewOpen(true)}
              disabled={!tripState}
            >
              Minha Trip
            </Button>
          </div>
        </section>
      ) : null}

      <section
        aria-label="Conversa"
        className="conversation-feed"
        ref={feedScrollRef}
      >
        {messages.map((message) => (
          <Card
            key={message.id}
            className={message.role === 'user' ? 'message-card-user' : 'message-card-system'}
          >
            <p className="message-role">{message.role === 'user' ? 'Voce' : 'Palm Map'}</p>
            <p className="message-text">{message.text}</p>

            {message.nextQuestion ? (
              <p className="next-question">Proxima pergunta: {message.nextQuestion}</p>
            ) : null}

            {message.suggestedRoute ? (
              <section aria-label="Rota sugerida" className="route-box">
                <p className="route-title">Estrutura da viagem</p>
                <ul className="route-list">
                  {message.suggestedRoute.nodes.map((node, index) => (
                    <li key={`${message.id}-${node.role}-${node.city}-${index}`}>
                      <strong>{node.city}</strong> ({node.role})
                      {node.stayDays ? ` - ${node.stayDays} dias` : ''}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {message.groundedSuggestions ? (
              <section aria-label="Sugestoes grounded" className="grounded-box">
                <p className="route-title">
                  Sugestoes em {message.groundedSuggestions.city}
                  {message.groundedSuggestions.regionHint
                    ? ` - ${message.groundedSuggestions.regionHint}`
                    : ''}
                </p>
                <ul className="grounded-list">
                  {message.groundedSuggestions.items.map((item) => (
                    <li key={`${message.id}-${item.chunkId}`} className="grounded-item">
                      <p className="grounded-item-title">
                        {item.rank}. {item.title}
                      </p>
                      <p className="grounded-item-meta">
                        {item.category} • {item.region} • score {item.score}
                      </p>
                      <p className="grounded-item-summary">{item.summary}</p>
                      <Button
                        variant="tonal"
                        className="grounded-save-button"
                        disabled={isSubmitting}
                        onClick={() => void handleSaveSuggestionOption(item.rank)}
                      >
                        Salvar opcao {item.rank}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </Card>
        ))}
      </section>

      <Card>
        <div className="trip-form">
          <label className="grid gap-2 text-sm">
            <span>Mensagem</span>
            <textarea
              className="w-full rounded-sm border border-black/20 bg-surface px-3 py-2 text-sm text-onsurface"
              name="message"
              placeholder="Ex: Quero viajar de Natal para Aracaju por 8 dias, passando 2 dias em Maceio."
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
              onKeyDown={handleDraftKeyDown}
            />
          </label>

          <Button
            disabled={isSubmitting || draftMessage.trim() === ''}
            onClick={() => void handleSubmit()}
          >
            {isSubmitting ? 'Enviando...' : 'Enviar'}
          </Button>
        </div>
      </Card>

      <TripOverviewSheet
        open={isTripOverviewOpen}
        onClose={() => setTripOverviewOpen(false)}
        tripState={tripState}
        tripLegs={currentTripLegs}
      />

      {error ? <p className="error-note" role="alert">{error}</p> : null}
      {isSubmitting ? <p className="text-sm text-onsurface/70">Atualizando estado da viagem...</p> : null}
    </main>
  )
}

function buildSystemText(tripState: TripState): string {
  const parts: string[] = []

  if (tripState.origin) {
    parts.push(`Origem: ${tripState.origin}.`)
  }

  if (tripState.destination) {
    parts.push(`Destino: ${tripState.destination}.`)
  }

  if (tripState.daysTotal) {
    parts.push(`Duracao: ${tripState.daysTotal} dias.`)
  }

  if (tripState.stops.length > 0) {
    parts.push(`Paradas: ${tripState.stops.map((stop) => stop.city).join(', ')}.`)
  }

  if (parts.length === 0) {
    return 'Atualizei o estado da viagem com base na sua mensagem.'
  }

  return parts.join(' ')
}
