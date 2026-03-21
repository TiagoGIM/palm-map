import type {
  ConversationAskField,
  ConversationFocusField,
  ConversationMeta,
  ConversationStage,
  FieldConfidence,
  GroundedSuggestions,
  SuggestedRoute,
  TripLeg,
  TripState,
} from '../../packages/shared-types'
import {
  type ExtractedUpdate,
  type MissingField,
} from './conversation-types'
import { resolveCurrentFocus } from './conversation-merge'
import { extractShortPlaceAnswer } from './conversation-extract'

export function chooseNextQuestion(params: {
  previousState: TripState
  nextState: TripState
  extracted: ExtractedUpdate
  userMessage: string
  groundedResolution: {
    groundedSuggestions?: GroundedSuggestions
    assistantMessage?: string
    needsCityQuestion?: string
  }
}): {
  askedField?: ConversationAskField
  nextQuestion?: string
  assistantMessage?: string
} {
  if (params.groundedResolution.needsCityQuestion) {
    return {
      askedField: 'saved_place_city',
      nextQuestion: params.groundedResolution.needsCityQuestion,
    }
  }

  if (params.groundedResolution.assistantMessage) {
    return { assistantMessage: params.groundedResolution.assistantMessage }
  }

  if (params.extracted.savedPlaceNeedsCity) {
    return {
      askedField: 'saved_place_city',
      nextQuestion: 'Em qual cidade fica esse lugar?',
    }
  }

  if (params.extracted.savedPlaceNeedsPlaceName) {
    return {
      askedField: 'saved_place_name',
      nextQuestion: 'Qual lugar voce quer adicionar ou remover?',
    }
  }

  if (params.extracted.savedPlaceNeedsSuggestionRefresh) {
    return {
      nextQuestion:
        'Essas sugestoes ja estao antigas para confirmar a opcao. Pode pedir novas sugestoes e repetir qual opcao quer salvar?',
    }
  }

  if (
    params.extracted.savedPlaceListIntent &&
    !params.extracted.savedPlaceListCity &&
    !params.nextState.conversationMeta?.currentFocusCity
  ) {
    return {
      askedField: 'saved_place_city',
      nextQuestion: 'De qual cidade voce quer listar os lugares salvos?',
    }
  }

  if (params.extracted.savedPlaceListIntent) {
    return {
      assistantMessage: buildSavedPlacesListMessage(
        params.nextState,
        params.extracted.savedPlaceListCity ??
          params.nextState.conversationMeta?.currentFocusCity,
      ),
    }
  }

  const unresolvedFields = computeUnresolvedFields(params.nextState)
  const candidateField =
    getNextCandidateField(params.nextState, unresolvedFields) ??
    (params.extracted.llmPossibleMissingField as ConversationAskField | undefined)

  if (!candidateField) {
    return {}
  }

  const progress = getTurnProgress(params.previousState, params.nextState)
  const madeAnyProgress =
    progress.originUpdated ||
    progress.destinationUpdated ||
    progress.daysTotalUpdated ||
    progress.stopsUpdated ||
    progress.stopStayUpdated

  if (
    candidateField === 'daysTotal' &&
    madeAnyProgress &&
    !params.previousState.daysTotal
  ) {
    return {}
  }

  const previousAskedField = params.previousState.conversationMeta?.lastAskedField
  const recentAskedFields = params.previousState.conversationMeta?.askedFieldsRecent ?? []
  const askedRecentlyTooMuch =
    recentAskedFields.slice(-2).filter((field) => field === candidateField).length >= 2

  if (previousAskedField === candidateField) {
    const repeatedUserTurn =
      (
        params.previousState.conversationMeta?.lastUserMessage ??
        params.previousState.conversationMeta?.lastUserTurn
      )
        ?.trim()
        .toLowerCase() === params.userMessage.trim().toLowerCase()
    const answeredPlausibly = isPlausibleAnswerForField({
      field: candidateField,
      message: params.userMessage,
      extracted: params.extracted,
    })

    if (answeredPlausibly || madeAnyProgress || repeatedUserTurn) {
      return {}
    }
  }

  if (askedRecentlyTooMuch && madeAnyProgress) {
    return {}
  }

  return {
    askedField: candidateField,
    nextQuestion: getQuestionByMissingField(candidateField),
  }
}

function getNextCandidateField(
  tripState: TripState,
  unresolvedFields: ConversationAskField[],
): ConversationAskField | undefined {
  if (unresolvedFields.length === 0) {
    return undefined
  }

  if (
    tripState.origin &&
    tripState.destination &&
    tripState.origin.toLowerCase() === tripState.destination.toLowerCase()
  ) {
    return 'destination'
  }

  return unresolvedFields[0]
}

export function getTurnProgress(
  previousState: TripState,
  nextState: TripState,
): {
  originUpdated: boolean
  destinationUpdated: boolean
  daysTotalUpdated: boolean
  stopsUpdated: boolean
  stopStayUpdated: boolean
} {
  const previousStopsByCity = new Map(
    previousState.stops.map((stop) => [stop.city.toLowerCase(), stop]),
  )

  let stopsUpdated = false
  let stopStayUpdated = false

  nextState.stops.forEach((stop) => {
    const previousStop = previousStopsByCity.get(stop.city.toLowerCase())
    if (!previousStop) {
      stopsUpdated = true
      if (stop.stayDays !== undefined) {
        stopStayUpdated = true
      }
      return
    }

    if (previousStop.stayDays !== stop.stayDays && stop.stayDays !== undefined) {
      stopStayUpdated = true
    }
  })

  return {
    originUpdated: !previousState.origin && Boolean(nextState.origin),
    destinationUpdated: !previousState.destination && Boolean(nextState.destination),
    daysTotalUpdated: !previousState.daysTotal && Boolean(nextState.daysTotal),
    stopsUpdated,
    stopStayUpdated,
  }
}

export function getLastResolvedField(progress: {
  originUpdated: boolean
  destinationUpdated: boolean
  daysTotalUpdated: boolean
  stopsUpdated: boolean
  stopStayUpdated: boolean
}): ConversationAskField | undefined {
  if (progress.originUpdated) return 'origin'
  if (progress.destinationUpdated) return 'destination'
  if (progress.daysTotalUpdated) return 'daysTotal'
  if (progress.stopStayUpdated) return 'stop_stay_days'
  return undefined
}

export function computeUnresolvedFields(
  tripState: TripState,
): ConversationAskField[] {
  const unresolved: ConversationAskField[] = []

  if (!tripState.origin) unresolved.push('origin')
  if (!tripState.destination) unresolved.push('destination')

  const stopWithoutStay = tripState.stops.find((stop) => stop.stayDays === undefined)
  if (stopWithoutStay && !tripState.daysTotal) {
    unresolved.push('stop_stay_days')
  }

  if (!tripState.daysTotal) unresolved.push('daysTotal')

  return unresolved
}

export function deriveConversationStage(
  unresolvedFields: ConversationAskField[],
): ConversationStage {
  if (unresolvedFields.includes('origin') || unresolvedFields.includes('destination')) {
    return 'collecting_core'
  }
  if (unresolvedFields.length > 0) {
    return 'collecting_details'
  }
  return 'ready_to_suggest'
}

export function buildConversationMeta(params: {
  previousMeta?: ConversationMeta
  userMessage: string
  askedField?: ConversationAskField
  lastResolvedField?: ConversationAskField
  nextState: TripState
  extracted: ExtractedUpdate
}): ConversationMeta {
  const previousRecent = params.previousMeta?.askedFieldsRecent ?? []
  const nextRecent = params.askedField
    ? [...previousRecent, params.askedField].slice(-5)
    : previousRecent

  const unresolvedFields = computeUnresolvedFields(params.nextState)
  const conversationStage = deriveConversationStage(unresolvedFields)
  const confidenceByField = buildConfidenceByField({
    previous: params.previousMeta?.confidenceByField,
    extracted: params.extracted,
  })
  const focus = determineConversationFocus({
    previousMeta: params.previousMeta,
    extracted: params.extracted,
    nextState: params.nextState,
  })

  return {
    lastAskedField: params.askedField,
    askedFieldsRecent: nextRecent,
    lastResolvedField: params.lastResolvedField,
    lastUserMessage: params.userMessage,
    // Backward-compatible alias.
    lastUserTurn: params.userMessage,
    conversationStage,
    confidenceByField,
    unresolvedFields,
    currentFocusCity: focus?.city,
    currentFocusField: focus?.field,
    lastSuggestions:
      params.nextState.conversationMeta?.lastSuggestions ??
      params.previousMeta?.lastSuggestions,
    lastSuggestionsCity:
      params.nextState.conversationMeta?.lastSuggestionsCity ??
      params.previousMeta?.lastSuggestionsCity,
    lastSuggestionsRegion:
      params.nextState.conversationMeta?.lastSuggestionsRegion ??
      params.previousMeta?.lastSuggestionsRegion,
    lastSuggestionsQuery:
      params.nextState.conversationMeta?.lastSuggestionsQuery ??
      params.previousMeta?.lastSuggestionsQuery,
    lastSuggestionsAt:
      params.nextState.conversationMeta?.lastSuggestionsAt ??
      params.previousMeta?.lastSuggestionsAt,
  }
}

function determineConversationFocus(params: {
  previousMeta?: ConversationMeta
  extracted: ExtractedUpdate
  nextState: TripState
}): { city: string; field: ConversationFocusField } | undefined {
  const latestSavedPlaceCity = params.extracted.savedPlaceAdds.at(-1)?.city
  if (latestSavedPlaceCity) {
    const stopMatch = params.nextState.stops.some(
      (stop) => stop.city.toLowerCase() === latestSavedPlaceCity.toLowerCase(),
    )
    return {
      city: latestSavedPlaceCity,
      field: stopMatch ? 'stop' : 'destination',
    }
  }

  const latestStop = params.extracted.stops.at(-1)?.city
  if (latestStop) {
    return { city: latestStop, field: 'stop' }
  }

  if (params.extracted.destination) {
    return { city: params.extracted.destination, field: 'destination' }
  }

  if (params.nextState.stops.length > 0) {
    const stop = params.nextState.stops[params.nextState.stops.length - 1]
    if (stop?.city) {
      return { city: stop.city, field: 'stop' }
    }
  }

  if (params.nextState.destination) {
    return { city: params.nextState.destination, field: 'destination' }
  }

  if (params.nextState.origin) {
    return { city: params.nextState.origin, field: 'origin' }
  }

  if (params.previousMeta?.currentFocusCity && params.previousMeta?.currentFocusField) {
    return {
      city: params.previousMeta.currentFocusCity,
      field: params.previousMeta.currentFocusField,
    }
  }

  return undefined
}

function buildConfidenceByField(params: {
  previous?: FieldConfidence
  extracted: ExtractedUpdate
}): FieldConfidence | undefined {
  const next: FieldConfidence = { ...(params.previous ?? {}) }
  const confidence = params.extracted.llmConfidence

  if (confidence === undefined) {
    return Object.keys(next).length > 0 ? next : undefined
  }

  if (params.extracted.origin) next.origin = confidence
  if (params.extracted.destination) next.destination = confidence
  if (params.extracted.daysTotal !== undefined) next.daysTotal = confidence
  if (params.extracted.stops.length > 0) next.stop_stay_days = confidence

  return Object.keys(next).length > 0 ? next : undefined
}

function isPlausibleAnswerForField(params: {
  field: ConversationAskField
  message: string
  extracted: ExtractedUpdate
}): boolean {
  if (params.field === 'origin') {
    return Boolean(params.extracted.origin ?? extractShortPlaceAnswer(params.message))
  }
  if (params.field === 'destination') {
    return Boolean(params.extracted.destination ?? extractShortPlaceAnswer(params.message))
  }
  if (params.field === 'daysTotal') {
    return params.extracted.daysTotal !== undefined
  }
  return params.extracted.stops.some((stop) => stop.stayDays !== undefined)
}

export function buildSuggestedRoute(tripState: TripState): SuggestedRoute | undefined {
  if (!tripState.origin || !tripState.destination) {
    return undefined
  }

  const blocked = new Set([
    tripState.origin.toLowerCase(),
    tripState.destination.toLowerCase(),
  ])

  const nodes: SuggestedRoute['nodes'] = [
    { city: tripState.origin, role: 'origin' },
    ...tripState.stops
      .filter((stop) => !blocked.has(stop.city.toLowerCase()))
      .map((stop) => ({
        city: stop.city,
        role: 'stop' as const,
        stayDays: stop.stayDays,
      })),
    { city: tripState.destination, role: 'destination' },
  ]

  return { nodes, daysTotal: tripState.daysTotal }
}

export function buildTripLegs(
  suggestedRoute: SuggestedRoute | undefined,
): TripLeg[] | undefined {
  if (!suggestedRoute || suggestedRoute.nodes.length < 2) {
    return undefined
  }

  const legs: TripLeg[] = []
  for (let index = 0; index < suggestedRoute.nodes.length - 1; index += 1) {
    const fromNode = suggestedRoute.nodes[index]
    const toNode = suggestedRoute.nodes[index + 1]
    legs.push({
      fromCity: fromNode.city,
      toCity: toNode.city,
      order: index + 1,
      stayDaysAtDestination: toNode.stayDays,
    })
  }

  return legs
}

export function buildSuggestionsAssistantMessage(
  suggestions: GroundedSuggestions,
): string {
  const topItems = suggestions.items.slice(0, 3)
  const labels = topItems
    .map((item) => `${item.rank}. ${item.title} (${item.region})`)
    .join(' | ')

  return `Sugestoes grounded em ${suggestions.city}${suggestions.regionHint ? ` - ${suggestions.regionHint}` : ''}: ${labels}.`
}

function buildSavedPlacesListMessage(
  tripState: TripState,
  city: string | undefined,
): string {
  if (!city) {
    return 'Nao consegui identificar a cidade para listar os lugares salvos.'
  }

  const cityEntry = tripState.savedPlacesByCity.find(
    (entry) => entry.city.toLowerCase() === city.toLowerCase(),
  )

  if (!cityEntry || cityEntry.places.length === 0) {
    return `Voce ainda nao salvou lugares em ${city}.`
  }

  const places = cityEntry.places.map((place) => place.placeName).join(', ')
  return `Lugares salvos em ${city}: ${places}.`
}

function getQuestionByMissingField(
  missingField: ConversationAskField | MissingField,
): string | undefined {
  if (missingField === 'origin') return 'De qual cidade voce vai sair?'
  if (missingField === 'destination') return 'Qual e o destino principal da viagem?'
  if (missingField === 'daysTotal') return 'Quantos dias voce quer para essa viagem?'
  if (missingField === 'stop_stay_days') return 'Voce quer definir quantos dias em cada parada que mencionou?'
  if (missingField === 'saved_place_city') return 'Em qual cidade fica esse lugar?'
  if (missingField === 'saved_place_name') return 'Qual lugar voce quer adicionar ou remover?'
  return undefined
}

// Re-export for use by conversation-update orchestrator
export { resolveCurrentFocus }
