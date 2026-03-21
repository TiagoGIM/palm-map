import type { KeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'

import type {
  GroundedSuggestions,
  SuggestedRoute,
  TripState,
} from '../../packages/shared-types'
import { requestConversationUpdate } from './conversation-update-api'
import { AppBar } from './ui/navigation/AppBar'
import { Button } from './ui/primitives/Button'
import { Card } from './ui/primitives/Card'

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

  useEffect(() => {
    if (!feedScrollRef.current) {
      return
    }

    feedScrollRef.current.scrollTop = feedScrollRef.current.scrollHeight
  }, [messages, isSubmitting])

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
