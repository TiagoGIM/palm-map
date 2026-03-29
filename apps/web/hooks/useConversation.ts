import type { KeyboardEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ConversationMessage,
  ConversationMeta,
  TripLeg,
  TripState,
} from '../../../packages/shared-types'
import { requestConversationUpdate } from '../conversation-update-api'

const SESSION_ID_KEY = 'palm_map_session_id'

function getOrCreateSessionId(): string {
  const stored = localStorage.getItem(SESSION_ID_KEY)
  if (stored) return stored
  const id = crypto.randomUUID()
  localStorage.setItem(SESSION_ID_KEY, id)
  return id
}

function buildSystemText(tripState: TripState): string {
  const parts: string[] = []
  if (tripState.origin) parts.push(`Origem: ${tripState.origin}.`)
  if (tripState.destination) parts.push(`Destino: ${tripState.destination}.`)
  if (tripState.daysTotal) parts.push(`Duracao: ${tripState.daysTotal} dias.`)
  if (tripState.stops.length > 0) {
    parts.push(`Paradas: ${tripState.stops.map((s) => s.city).join(', ')}.`)
  }
  return parts.length === 0
    ? 'Atualizei o estado da viagem com base na sua mensagem.'
    : parts.join(' ')
}

export type PlanNode = {
  city: string
  role: 'origin' | 'stop' | 'destination'
  stayDays?: number
}

export function useConversation() {
  const feedScrollRef = useRef<HTMLElement | null>(null)
  const sessionId = useRef<string>(getOrCreateSessionId())

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
  const [nextQuestionBanner, setNextQuestionBanner] = useState<string | undefined>(undefined)
  const [currentTripLegs, setCurrentTripLegs] = useState<TripLeg[] | undefined>()
  const [conversationMeta, setConversationMeta] = useState<ConversationMeta | undefined>()
  const [isTripOverviewOpen, setTripOverviewOpen] = useState(false)

  const planNodes = useMemo((): PlanNode[] => {
    if (!tripState) return []
    const nodes: PlanNode[] = []
    if (tripState.origin) nodes.push({ city: tripState.origin, role: 'origin' })
    tripState.stops.forEach((stop) => {
      if (stop?.city) nodes.push({ city: stop.city, role: 'stop', stayDays: stop.stayDays })
    })
    if (tripState.destination) nodes.push({ city: tripState.destination, role: 'destination' })
    return nodes
  }, [tripState])

  const savedPlacesMap = useMemo(() => {
    const map = new Map<string, string[]>()
    if (!tripState) return map
    tripState.savedPlacesByCity.forEach((entry) => {
      if (!entry.city || entry.places.length === 0) return
      const names = entry.places
        .map((p) => p.placeName?.trim())
        .filter((n): n is string => Boolean(n))
      if (names.length > 0) map.set(entry.city.toLowerCase(), names)
    })
    return map
  }, [tripState])

  useEffect(() => {
    if (feedScrollRef.current) {
      feedScrollRef.current.scrollTop = feedScrollRef.current.scrollHeight
    }
  }, [messages, isSubmitting])

  useEffect(() => {
    if (!tripState) setTripOverviewOpen(false)
  }, [tripState])

  async function handleSubmit(rawMessage?: string) {
    const message = (rawMessage ?? draftMessage).trim()
    if (!message || isSubmitting) return

    const userMessage: ConversationMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: message,
    }

    setMessages((current) => [...current, userMessage])
    setIsSubmitting(true)
    setError(null)

    try {
      const result = await requestConversationUpdate({ message, tripState, sessionId: sessionId.current })

      if (!rawMessage) setDraftMessage('')  // clear draft only on success
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
    await handleSubmit(`salva a ${rank} opcao`)
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void handleSubmit()
  }

  return {
    feedScrollRef,
    tripState,
    draftMessage,
    setDraftMessage,
    messages,
    error,
    isSubmitting,
    nextQuestionBanner,
    currentTripLegs,
    conversationMeta,
    isTripOverviewOpen,
    setTripOverviewOpen,
    planNodes,
    savedPlacesMap,
    handleSubmit,
    handleSaveSuggestionOption,
    handleDraftKeyDown,
  }
}
