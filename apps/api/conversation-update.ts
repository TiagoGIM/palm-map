import type {
  CitySavedPlaces,
  ConversationAskField,
  ConversationFocusField,
  ConversationStage,
  FieldConfidence,
  GroundedSuggestionItem,
  GroundedSuggestions,
  ConversationMeta,
  ConversationTripUpdateInput,
  ConversationTripUpdateResult,
  SavedPlace,
  SuggestedRoute,
  TripLeg,
  TripState,
} from '../../packages/shared-types'
import { retrieveLocalRecifeV1WithContext } from '../../packages/domain-retrieval/retrieve-local'
import {
  extractStructuredWithLlm,
  type ConversationLlmEnv,
  type LlmStructuredExtraction,
} from './conversation-llm-adapter'

type ApiErrorBody = {
  error: {
    code: 'invalid_request'
    message: string
  }
}

type ApiSuccessResponse = {
  status: 200
  body: ConversationTripUpdateResult
}

type ApiErrorResponse = {
  status: 400
  body: ApiErrorBody
}

export type ConversationUpdateHttpResponse = ApiSuccessResponse | ApiErrorResponse

export type ConversationUpdateRuntimeEnv = ConversationLlmEnv & {
  CONVERSATION_LLM_DEBUG?: string
  CONVERSATION_UPDATE_DEBUG?: string
  CONVERSATION_LLM_MIN_CONFIDENCE?: string
}

export async function handleConversationUpdate(
  requestBody: unknown,
  env: ConversationUpdateRuntimeEnv = {},
): Promise<ConversationUpdateHttpResponse> {
  const input = parseConversationUpdateInput(requestBody)

  if (!input) {
    return {
      status: 400,
      body: {
        error: {
          code: 'invalid_request',
          message: 'Request body must match ConversationTripUpdateInput.',
        },
      },
    }
  }

  const baseState = createBaseTripState(input.tripState)
  const missingFieldBeforeMerge = getCurrentMissingField(baseState)
  const lastAskedFieldBeforeMerge = baseState.conversationMeta?.lastAskedField

  const extractedSignals = await extractConversationSignals({
    message: input.message,
    tripState: baseState,
    env,
  })

  const normalizedSignals = normalizeConversationEntities({
    env,
    currentState: baseState,
    missingField: missingFieldBeforeMerge,
    lastAskedField: lastAskedFieldBeforeMerge,
    message: input.message,
    extracted: extractedSignals,
  })

  const resolvedSignals = resolveContextualReferences({
    env,
    currentState: baseState,
    extracted: normalizedSignals,
    message: input.message,
  })

  const mergedState = mergeConversationState({
    env,
    currentState: baseState,
    extracted: resolvedSignals,
  })

  const groundedResolution = resolveGroundedSuggestions({
    env,
    currentState: mergedState,
    extracted: resolvedSignals,
    message: input.message,
  })

  const nextAction = decideNextAction({
    env,
    previousState: baseState,
    nextState: groundedResolution.nextState,
    extracted: resolvedSignals,
    userMessage: input.message,
    groundedResolution,
  })

  const nextTripState = nextAction.nextState
  const nextQuestion = nextAction.nextQuestion
  const assistantMessage = nextAction.assistantMessage
  const suggestedRoute = buildSuggestedRoute(nextTripState)
  const tripLegs = buildTripLegs(suggestedRoute)
  const groundedSuggestions = groundedResolution.groundedSuggestions

  logConversationUpdateDebug({
    env,
    previousState: baseState,
    missingField: missingFieldBeforeMerge,
    previousAskedField: lastAskedFieldBeforeMerge,
    message: input.message,
    extracted: resolvedSignals,
    nextState: nextTripState,
    finalUnresolvedFields: nextTripState.conversationMeta?.unresolvedFields ?? [],
    finalAskedField: nextAction.askedField,
    updatedField: nextAction.lastResolvedField,
    focusCity: nextTripState.conversationMeta?.currentFocusCity,
    assistantMessage,
    nextQuestion,
  })

  return {
    status: 200,
    body: {
      tripState: nextTripState,
      assistantMessage,
      nextQuestion,
      suggestedRoute,
      tripLegs,
      groundedSuggestions,
    },
  }
}

type ExtractedStopMention = {
  city: string
  stayDays?: number
  deltaStayDays?: number
  strongAppend: boolean
}

type ExtractedSavedPlaceAdd = {
  city?: string
  placeName?: string
  note?: string
  source?: SavedPlace['source']
}

type ExtractedSavedPlaceRemove = {
  city?: string
  placeName?: string
}

type ExtractedSuggestionSaveReference = {
  ordinalIndex: number
}

type ExtractedUpdate = {
  origin?: string
  destination?: string
  daysTotal?: number
  stops: ExtractedStopMention[]
  likes: string[]
  dislikes: string[]
  pace?: TripState['preferences']['pace']
  budget?: TripState['preferences']['budget']
  llmNextQuestion?: string
  llmPossibleMissingField?: MissingField
  llmConfidence?: number
  savedPlaceAdds: ExtractedSavedPlaceAdd[]
  savedPlaceRemoves: ExtractedSavedPlaceRemove[]
  savedPlaceListIntent: boolean
  savedPlaceListCity?: string
  savedPlaceNeedsCity?: boolean
  savedPlaceNeedsPlaceName?: boolean
  savedPlaceNeedsSuggestionRefresh?: boolean
  savedPlaceSaveReference?: ExtractedSuggestionSaveReference
  suggestionIntent?: boolean
  suggestionQuery?: string
}

type MissingField = 'origin' | 'destination' | 'daysTotal' | undefined

const CONVERSATION_RETRIEVE_TOP_K = 3
const SUGGESTION_STALE_WINDOW_MS = 10 * 60 * 1000

function createBaseTripState(tripState?: TripState): TripState {
  return {
    ...tripState,
    stops: tripState?.stops ?? [],
    savedPlacesByCity: tripState?.savedPlacesByCity ?? [],
    preferences: {
      likes: tripState?.preferences?.likes ?? [],
      dislikes: tripState?.preferences?.dislikes ?? [],
      pace: tripState?.preferences?.pace,
      budget: tripState?.preferences?.budget,
    },
    conversationMeta: {
      lastAskedField: tripState?.conversationMeta?.lastAskedField,
      askedFieldsRecent: tripState?.conversationMeta?.askedFieldsRecent ?? [],
      lastResolvedField: tripState?.conversationMeta?.lastResolvedField,
      lastUserMessage:
        tripState?.conversationMeta?.lastUserMessage ??
        tripState?.conversationMeta?.lastUserTurn,
      lastUserTurn: tripState?.conversationMeta?.lastUserTurn,
      conversationStage: tripState?.conversationMeta?.conversationStage,
      confidenceByField: tripState?.conversationMeta?.confidenceByField,
      unresolvedFields: tripState?.conversationMeta?.unresolvedFields ?? [],
      currentFocusCity: tripState?.conversationMeta?.currentFocusCity,
      currentFocusField: tripState?.conversationMeta?.currentFocusField,
      lastSuggestions: tripState?.conversationMeta?.lastSuggestions,
      lastSuggestionsCity: tripState?.conversationMeta?.lastSuggestionsCity,
      lastSuggestionsRegion: tripState?.conversationMeta?.lastSuggestionsRegion,
      lastSuggestionsQuery: tripState?.conversationMeta?.lastSuggestionsQuery,
      lastSuggestionsAt: tripState?.conversationMeta?.lastSuggestionsAt,
    },
  }
}

async function extractConversationSignals(params: {
  message: string
  tripState: TripState
  env: ConversationUpdateRuntimeEnv
}): Promise<ExtractedUpdate> {
  const extracted = await extractFromMessage(params)
  logConversationStage(params.env, 'extractConversationSignals', {
    extracted: summarizeExtractedUpdate(extracted),
  })
  return extracted
}

function normalizeConversationEntities(params: {
  env: ConversationUpdateRuntimeEnv
  currentState: TripState
  missingField: MissingField
  lastAskedField?: ConversationAskField
  message: string
  extracted: ExtractedUpdate
}): ExtractedUpdate {
  const normalized = applyContextualShortAnswer({
    currentState: params.currentState,
    missingField: params.missingField,
    lastAskedField: params.lastAskedField,
    message: params.message,
    extracted: params.extracted,
  })

  logConversationStage(params.env, 'normalizeEntities', {
    extracted: summarizeExtractedUpdate(normalized),
  })

  return normalized
}

function resolveContextualReferences(params: {
  env: ConversationUpdateRuntimeEnv
  currentState: TripState
  extracted: ExtractedUpdate
  message: string
}): ExtractedUpdate {
  const resolved = applyContextualPlaceReferences(params)
  logConversationStage(params.env, 'resolveContextualReferences', {
    extracted: summarizeExtractedUpdate(resolved),
    focusCity: params.currentState.conversationMeta?.currentFocusCity,
  })
  return resolved
}

function mergeConversationState(params: {
  env: ConversationUpdateRuntimeEnv
  currentState: TripState
  extracted: ExtractedUpdate
}): TripState {
  const merged = mergeTripState(params.currentState, params.extracted)
  if (params.extracted.savedPlaceSaveReference && params.extracted.savedPlaceAdds.length > 0) {
    logConversationStage(params.env, 'resolveGroundedSuggestions', {
      event: 'saved_from_suggestion',
      ordinalIndex: params.extracted.savedPlaceSaveReference.ordinalIndex,
      city: params.extracted.savedPlaceAdds[0]?.city,
      place: params.extracted.savedPlaceAdds[0]?.placeName,
    })
  }
  logConversationStage(params.env, 'mergeTripState', {
    next: summarizeTripState(merged),
  })
  return merged
}

function resolveGroundedSuggestions(params: {
  env: ConversationUpdateRuntimeEnv
  currentState: TripState
  extracted: ExtractedUpdate
  message: string
}): {
  nextState: TripState
  groundedSuggestions?: GroundedSuggestions
  assistantMessage?: string
  needsCityQuestion?: string
} {
  const suggestionIntent = params.extracted.suggestionIntent === true
  if (!suggestionIntent) {
    return { nextState: params.currentState }
  }

  const location = resolveSuggestionLocation(
    params.message,
    params.currentState,
    params.extracted,
  )
  if (!location.city) {
    logConversationStage(params.env, 'resolveGroundedSuggestions', {
      event: 'retrieval_skipped_no_city',
    })
    return {
      nextState: params.currentState,
      needsCityQuestion: 'De qual cidade voce quer sugestoes?',
    }
  }

  logConversationStage(params.env, 'resolveGroundedSuggestions', {
    event: 'retrieval_triggered',
    city: location.city,
    regionHint: location.regionHint,
  })

  const retrieveResult = retrieveLocalRecifeV1WithContext(
    {
      query: params.extracted.suggestionQuery ?? params.message,
      city: location.city,
      topK: CONVERSATION_RETRIEVE_TOP_K,
    },
    {
      regionHint: location.regionHint,
      categoryHint: extractSuggestionCategoryHint(params.message),
    },
  )

  if (retrieveResult.results.length === 0) {
    logConversationStage(params.env, 'resolveGroundedSuggestions', {
      event: 'retrieval_empty',
      city: location.city,
    })
    return {
      nextState: clearSuggestionCache(params.currentState),
      assistantMessage:
        'Nao encontrei sugestoes grounded com essa busca. Se quiser, tente com outro tipo de lugar ou detalhe da cidade.',
    }
  }

  const suggestionItems: GroundedSuggestionItem[] = retrieveResult.results.map(
    (result, index) => ({
      rank: index + 1,
      city: result.city,
      region: result.region,
      title: result.title,
      category: result.category,
      summary: result.summary,
      source: result.source,
      score: result.score,
      docId: result.docId,
      chunkId: result.chunkId,
    }),
  )

  const groundedSuggestions: GroundedSuggestions = {
    city: retrieveResult.city,
    regionHint: location.regionHint,
    query: retrieveResult.query,
    topK: retrieveResult.topK,
    items: suggestionItems,
  }

  const nextState: TripState = {
    ...params.currentState,
    conversationMeta: {
      ...params.currentState.conversationMeta,
      lastSuggestions: suggestionItems,
      lastSuggestionsCity: retrieveResult.city,
      lastSuggestionsRegion: location.regionHint,
      lastSuggestionsQuery: retrieveResult.query,
      lastSuggestionsAt: new Date().toISOString(),
    },
  }

  logConversationStage(params.env, 'resolveGroundedSuggestions', {
    event: 'retrieval_suggestions_returned',
    city: retrieveResult.city,
    count: suggestionItems.length,
  })

  return {
    nextState,
    groundedSuggestions,
    assistantMessage: buildSuggestionsAssistantMessage(groundedSuggestions),
  }
}

function decideNextAction(params: {
  env: ConversationUpdateRuntimeEnv
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
  nextState: TripState
  nextQuestion?: string
  assistantMessage?: string
  askedField?: ConversationAskField
  lastResolvedField?: ConversationAskField
} {
  const turnProgress = getTurnProgress(params.previousState, params.nextState)
  const lastResolvedField = getLastResolvedField(turnProgress)
  const nextQuestionDecision = chooseNextQuestion({
    previousState: params.previousState,
    nextState: params.nextState,
    extracted: params.extracted,
    userMessage: params.userMessage,
    groundedResolution: params.groundedResolution,
  })

  const finalState: TripState = {
    ...params.nextState,
    conversationMeta: buildConversationMeta({
      previousMeta: params.previousState.conversationMeta,
      userMessage: params.userMessage,
      askedField: nextQuestionDecision.askedField,
      lastResolvedField,
      nextState: params.nextState,
      extracted: params.extracted,
    }),
  }

  logConversationStage(params.env, 'decideNextAction', {
    askedField: nextQuestionDecision.askedField,
    nextQuestion: nextQuestionDecision.nextQuestion,
    unresolvedFields: finalState.conversationMeta?.unresolvedFields ?? [],
  })

  return {
    nextState: finalState,
    nextQuestion: nextQuestionDecision.nextQuestion,
    assistantMessage: nextQuestionDecision.assistantMessage,
    askedField: nextQuestionDecision.askedField,
    lastResolvedField,
  }
}

function mergeTripState(
  current: TripState,
  extracted: ExtractedUpdate,
): TripState {
  const nextOrigin = extracted.origin ?? current.origin
  const nextDestination = extracted.destination ?? current.destination
  const nextStops = mergeStops(
    current.stops,
    extracted.stops,
    nextOrigin,
    nextDestination,
  )
  const nextSavedPlacesByCity = mergeSavedPlacesByCity(
    current.savedPlacesByCity,
    extracted.savedPlaceAdds,
    extracted.savedPlaceRemoves,
  )
  const nextLikes = mergeUnique(current.preferences.likes, extracted.likes)
  const nextDislikes = mergeUnique(
    current.preferences.dislikes,
    extracted.dislikes,
  )

  return {
    ...current,
    origin: nextOrigin,
    destination: nextDestination,
    daysTotal: extracted.daysTotal ?? current.daysTotal,
    stops: nextStops,
    savedPlacesByCity: nextSavedPlacesByCity,
    preferences: {
      ...current.preferences,
      likes: nextLikes,
      dislikes: nextDislikes,
      pace: extracted.pace ?? current.preferences.pace,
      budget: extracted.budget ?? current.preferences.budget,
    },
  }
}

function mergeStops(
  current: TripState['stops'],
  extractedStops: ExtractedStopMention[],
  origin?: string,
  destination?: string,
): TripState['stops'] {
  const nextStops = current.map((stop) => ({ ...stop }))
  const blockedCities = new Set(
    [origin, destination]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase()),
  )

  extractedStops.forEach((mention) => {
    const mentionKey = mention.city.toLowerCase()
    if (blockedCities.has(mentionKey)) {
      return
    }

    const existingIndex = nextStops.findIndex(
      (stop) => stop.city.toLowerCase() === mentionKey,
    )

    if (existingIndex >= 0) {
      if (mention.deltaStayDays !== undefined) {
        const currentStayDays = nextStops[existingIndex].stayDays ?? 0
        nextStops[existingIndex] = {
          ...nextStops[existingIndex],
          stayDays: currentStayDays + mention.deltaStayDays,
        }
        return
      }

      if (mention.stayDays !== undefined) {
        nextStops[existingIndex] = {
          ...nextStops[existingIndex],
          stayDays: mention.stayDays,
        }
      }
      return
    }

    if (!mention.strongAppend) {
      return
    }

    nextStops.push({
      city: mention.city,
      stayDays: mention.stayDays ?? mention.deltaStayDays,
    })
  })

  return nextStops
}

function mergeSavedPlacesByCity(
  current: CitySavedPlaces[],
  adds: ExtractedSavedPlaceAdd[],
  removes: ExtractedSavedPlaceRemove[],
): CitySavedPlaces[] {
  const next = current.map((entry) => ({
    city: entry.city,
    places: entry.places.map((place) => ({ ...place })),
  }))

  const indexByCity = new Map<string, number>()
  next.forEach((entry, index) => {
    indexByCity.set(entry.city.toLowerCase(), index)
  })

  adds.forEach((add) => {
    const city = add.city
    const placeName = add.placeName
    if (!city || !placeName) {
      return
    }

    const cityKey = city.toLowerCase()

    const place: SavedPlace = {
      placeName,
      note: add.note,
      source: add.source ?? 'user',
    }

    const knownIndex = indexByCity.get(cityKey)
    if (knownIndex === undefined) {
      next.push({
        city,
        places: [place],
      })
      indexByCity.set(cityKey, next.length - 1)
      return
    }

    const cityEntry = next[knownIndex]
    const alreadyExists = cityEntry.places.some(
      (knownPlace) =>
        knownPlace.placeName.toLowerCase() === placeName.toLowerCase(),
    )
    if (!alreadyExists) {
      cityEntry.places.push(place)
    }
  })

  removes.forEach((remove) => {
    const city = remove.city
    const placeName = remove.placeName
    if (!city || !placeName) {
      return
    }

    const knownIndex = indexByCity.get(city.toLowerCase())
    if (knownIndex === undefined) {
      return
    }

    const cityEntry = next[knownIndex]
    cityEntry.places = cityEntry.places.filter(
      (knownPlace) =>
        knownPlace.placeName.toLowerCase() !== placeName.toLowerCase(),
    )
  })

  return next.filter((entry) => entry.places.length > 0)
}

function mergeUnique(current: string[], extracted: string[]): string[] {
  const merged = [...current]

  extracted.forEach((item) => {
    const exists = merged.some(
      (knownItem) => knownItem.toLowerCase() === item.toLowerCase(),
    )

    if (!exists) {
      merged.push(item)
    }
  })

  return merged
}

function chooseNextQuestion(params: {
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
    return {
      assistantMessage: params.groundedResolution.assistantMessage,
    }
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
      (params.previousState.conversationMeta?.lastUserMessage ??
        params.previousState.conversationMeta?.lastUserTurn)
        ?.trim()
        .toLowerCase() ===
      params.userMessage.trim().toLowerCase()
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

function getTurnProgress(
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

function getLastResolvedField(progress: {
  originUpdated: boolean
  destinationUpdated: boolean
  daysTotalUpdated: boolean
  stopsUpdated: boolean
  stopStayUpdated: boolean
}): ConversationAskField | undefined {
  if (progress.originUpdated) {
    return 'origin'
  }

  if (progress.destinationUpdated) {
    return 'destination'
  }

  if (progress.daysTotalUpdated) {
    return 'daysTotal'
  }

  if (progress.stopStayUpdated) {
    return 'stop_stay_days'
  }

  return undefined
}

function computeUnresolvedFields(tripState: TripState): ConversationAskField[] {
  const unresolved: ConversationAskField[] = []

  if (!tripState.origin) {
    unresolved.push('origin')
  }

  if (!tripState.destination) {
    unresolved.push('destination')
  }

  const stopWithoutStay = tripState.stops.find((stop) => stop.stayDays === undefined)
  if (stopWithoutStay && !tripState.daysTotal) {
    unresolved.push('stop_stay_days')
  }

  if (!tripState.daysTotal) {
    unresolved.push('daysTotal')
  }

  return unresolved
}

function deriveConversationStage(
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

function buildConfidenceByField(params: {
  previous?: FieldConfidence
  extracted: ExtractedUpdate
}): FieldConfidence | undefined {
  const next: FieldConfidence = { ...(params.previous ?? {}) }
  const confidence = params.extracted.llmConfidence

  if (confidence === undefined) {
    return Object.keys(next).length > 0 ? next : undefined
  }

  if (params.extracted.origin) {
    next.origin = confidence
  }

  if (params.extracted.destination) {
    next.destination = confidence
  }

  if (params.extracted.daysTotal !== undefined) {
    next.daysTotal = confidence
  }

  if (params.extracted.stops.length > 0) {
    next.stop_stay_days = confidence
  }

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

function buildConversationMeta(params: {
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

  if (
    params.previousMeta?.currentFocusCity &&
    params.previousMeta?.currentFocusField
  ) {
    return {
      city: params.previousMeta.currentFocusCity,
      field: params.previousMeta.currentFocusField,
    }
  }

  return undefined
}

function buildSuggestedRoute(tripState: TripState): SuggestedRoute | undefined {
  if (!tripState.origin || !tripState.destination) {
    return undefined
  }

  const blocked = new Set([
    tripState.origin.toLowerCase(),
    tripState.destination.toLowerCase(),
  ])

  const nodes: SuggestedRoute['nodes'] = [
    {
      city: tripState.origin,
      role: 'origin',
    },
    ...tripState.stops
      .filter((stop) => !blocked.has(stop.city.toLowerCase()))
      .map((stop) => ({
        city: stop.city,
        role: 'stop' as const,
        stayDays: stop.stayDays,
      })),
    {
      city: tripState.destination,
      role: 'destination',
    },
  ]

  return {
    nodes,
    daysTotal: tripState.daysTotal,
  }
}

function buildTripLegs(suggestedRoute: SuggestedRoute | undefined): TripLeg[] | undefined {
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

async function extractFromMessage(params: {
  message: string
  tripState: TripState
  env: ConversationUpdateRuntimeEnv
}): Promise<ExtractedUpdate> {
  const llmResult = await extractStructuredWithLlm({
    message: params.message,
    tripState: params.tripState,
    env: params.env,
  })
  const minConfidence = parseMinConfidence(params.env.CONVERSATION_LLM_MIN_CONFIDENCE)

  if (!llmResult.ok) {
    logExtractionMode({
      env: params.env,
      event: llmResult.reason === 'llm_schema_validation_failed'
        ? 'validation_failed'
        : 'fallback_used',
      reason: llmResult.reason,
    })
    return extractHeuristicFromMessage(params.message, params.tripState)
  }

  if (isLowConfidence(llmResult.extraction.confidence, minConfidence)) {
    logExtractionMode({
      env: params.env,
      event: 'fallback_used',
      reason: 'low_confidence',
    })
    return extractHeuristicFromMessage(params.message, params.tripState)
  }

  logExtractionMode({
    env: params.env,
    event: 'llm_used',
  })

  const llmMapped = mapLlmExtractionToUpdate(llmResult.extraction)
  return augmentSavedPlacesFromMessage(llmMapped, params.message, params.tripState)
}

function extractHeuristicFromMessage(
  message: string,
  currentState: TripState,
): ExtractedUpdate {
  const lower = message.toLowerCase()
  const hasSavedPlaceMutationVerb =
    /\b(salvar|salva|guardar|guarda|adiciona|adicionar|incluir|inclui|remover|remove|tirar|tira|excluir|exclui|apagar|apaga)\b/i.test(
      message,
    )
  const hasSavedPlaceListVerb = /\b(lista|listar|mostra|mostrar|quais)\b/i.test(message)
  const hasSavedPlaceListTarget = /\b(lugares|locais|pontos)\b/i.test(message)
  const isSavedPlaceMessage =
    hasSavedPlaceMutationVerb || (hasSavedPlaceListVerb && hasSavedPlaceListTarget)
  const fullRoute = isSavedPlaceMessage
    ? undefined
    : message.match(
        /\bde\s+([a-zà-ÿ\s/.-]+?)\s+(?:para|pra|até|ate|a)\s+([a-zà-ÿ\s/.-]+?)(?=\s+\b(?:por|em|com|no|na|vou|quero|pretendo|passar|ficar|seguir)\b|[,.!?]|$)/i,
      )
  const originOnly = isSavedPlaceMessage
    ? undefined
    : message.match(
        /\b(?:saindo de|partindo de|de)\s+([a-zà-ÿ\s/.-]+?)(?=\s+\b(?:e|depois|para|pra|até|ate|a|vou|quero|pretendo|passar|ficar|seguir)\b|[,.!?]|$)/i,
      )
  const destinationOnly = isSavedPlaceMessage
    ? undefined
    : message.match(
        /\b(?:para|pra|até|ate)\s+([a-zà-ÿ\s/.-]+?)(?=\s+\b(?:por|em|com|no|na|e|vou|quero|pretendo|passar|ficar|seguir)\b|[,.!?]|$)/i,
      )

  const likes = extractPreferenceItems(
    message,
    /\b(?:gosto de|curto|prefiro)\s+([^.!?]+)/gi,
  )
  const dislikes = extractPreferenceItems(
    message,
    /\b(?:nao gosto de|não gosto de|nao curto|não curto|evito)\s+([^.!?]+)/gi,
  )

  const stops = extractStops(message)

  const base: ExtractedUpdate = {
    origin: fullRoute?.[1]
      ? normalizeCity(fullRoute[1])
      : originOnly?.[1]
        ? normalizeCity(originOnly[1])
        : undefined,
    destination: fullRoute?.[2]
      ? normalizeCity(fullRoute[2])
      : destinationOnly?.[1]
        ? normalizeCity(destinationOnly[1])
        : undefined,
    daysTotal: extractDaysTotal(lower),
    stops,
    likes,
    dislikes,
    pace: extractPace(lower),
    budget: extractBudget(lower),
    savedPlaceAdds: [],
    savedPlaceRemoves: [],
    savedPlaceListIntent: false,
    suggestionIntent: false,
  }

  return augmentSavedPlacesFromMessage(base, message, currentState)
}

function applyContextualShortAnswer(params: {
  currentState: TripState
  missingField: MissingField
  lastAskedField?: ConversationAskField
  message: string
  extracted: ExtractedUpdate
}): ExtractedUpdate {
  if (
    /\b(salvar|salva|guardar|guarda|adiciona|adicionar|incluir|inclui|remover|remove|tirar|tira|excluir|exclui|apagar|apaga|lista|listar|mostra|mostrar|sugere|sugest(ao|ão|oes|ões)|visitar|comer|fazer)\b/i.test(
      params.message,
    )
  ) {
    return params.extracted
  }

  const shouldPrioritizeDaysAnswer =
    params.lastAskedField === 'daysTotal' || params.missingField === 'daysTotal'
  if (shouldPrioritizeDaysAnswer && params.extracted.daysTotal === undefined) {
    const contextualDays = extractContextualDaysAnswer(params.message)
    if (contextualDays !== undefined) {
      return {
        ...params.extracted,
        daysTotal: contextualDays,
      }
    }
  }

  if (params.missingField !== 'origin' && params.missingField !== 'destination') {
    return params.extracted
  }

  const shortPlaceAnswer = extractShortPlaceAnswer(params.message)
  if (!shortPlaceAnswer) {
    return params.extracted
  }

  if (
    params.missingField === 'origin' &&
    !params.currentState.origin &&
    !params.extracted.origin
  ) {
    return {
      ...params.extracted,
      origin: shortPlaceAnswer,
    }
  }

  if (
    params.missingField === 'destination' &&
    !params.currentState.destination &&
    !params.extracted.destination
  ) {
    return {
      ...params.extracted,
      destination: shortPlaceAnswer,
    }
  }

  return params.extracted
}

function extractContextualDaysAnswer(message: string): number | undefined {
  const patterns = [
    /\b(?:vou\s+passar|passarei|serao|serão|sera|será|ficarei|quero|planejo)\s+(\d+)\s*dias?\b/i,
    /\b(\d+)\s*dias?\b/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) {
      const days = Number(match[1])
      if (Number.isInteger(days) && days > 0) {
        return days
      }
    }
  }

  return undefined
}

function applyContextualPlaceReferences(params: {
  currentState: TripState
  extracted: ExtractedUpdate
  message: string
}): ExtractedUpdate {
  const referenceType = detectContextualReferenceType(params.message)
  if (!referenceType) {
    return params.extracted
  }

  const focus = resolveCurrentFocus(
    params.currentState,
    params.extracted,
    referenceType,
  )
  if (!focus) {
    return params.extracted
  }

  const contextualDays = extractContextualDaysAnswer(params.message)
  if (contextualDays === undefined) {
    return params.extracted
  }

  if (focus.field === 'destination') {
    const nextDaysTotal = applyDaysDeltaIfNeeded({
      currentDaysTotal: params.currentState.daysTotal,
      message: params.message,
      incomingDays: contextualDays,
    })

    return {
      ...params.extracted,
      daysTotal: params.extracted.daysTotal ?? nextDaysTotal,
    }
  }

  if (focus.field === 'stop') {
    const deltaDays = extractDeltaDays(params.message)
    return {
      ...params.extracted,
      daysTotal: params.currentState.daysTotal,
      stops: [
        ...params.extracted.stops,
        {
          city: focus.city,
          stayDays: deltaDays ? undefined : contextualDays,
          deltaStayDays: deltaDays ? contextualDays : undefined,
          strongAppend: true,
        },
      ],
    }
  }

  return params.extracted
}

function resolveCurrentFocus(
  currentState: TripState,
  extracted: ExtractedUpdate,
  referenceType?: 'destination' | 'stop' | 'generic',
): { city: string; field: ConversationFocusField } | undefined {
  if (referenceType === 'destination') {
    if (currentState.destination) {
      return { city: currentState.destination, field: 'destination' }
    }
  }

  if (referenceType === 'stop') {
    const extractedStop = extracted.stops.at(-1)?.city
    if (extractedStop) {
      return { city: extractedStop, field: 'stop' }
    }

    const lastStop = currentState.stops.at(-1)?.city
    if (lastStop) {
      return { city: lastStop, field: 'stop' }
    }
  }

  const metaFocusCity = currentState.conversationMeta?.currentFocusCity
  const metaFocusField = currentState.conversationMeta?.currentFocusField

  if (metaFocusCity && metaFocusField) {
    return { city: metaFocusCity, field: metaFocusField }
  }

  const latestExtractedStop = extracted.stops.at(-1)?.city
  if (latestExtractedStop) {
    return { city: latestExtractedStop, field: 'stop' }
  }

  const lastStop = currentState.stops.at(-1)?.city
  if (lastStop) {
    return { city: lastStop, field: 'stop' }
  }

  if (currentState.destination) {
    return { city: currentState.destination, field: 'destination' }
  }

  if (currentState.origin) {
    return { city: currentState.origin, field: 'origin' }
  }

  return undefined
}

function extractSuggestionIntent(message: string): {
  triggered: boolean
  query?: string
} {
  const normalized = message.toLowerCase()
  if (
    /\b(salvar|salva|guardar|guarda|adiciona|adicionar|incluir|inclui|remover|remove|tirar|tira|excluir|exclui|apagar|apaga|lista|listar|mostra|mostrar)\b/i.test(
      normalized,
    )
  ) {
    return { triggered: false }
  }

  const triggered =
    /\b(sugere|sugest(ao|ão|oes|ões)|visitar|fazer|comer)\b/i.test(normalized) ||
    /\bo que vale\b/i.test(normalized) ||
    /\bop(c|ç)(ao|oes|ões)\b/i.test(normalized)

  if (!triggered) {
    return { triggered: false }
  }

  return {
    triggered: true,
    query: message.trim(),
  }
}

function extractSuggestionCategoryHint(
  message: string,
): 'attraction' | 'neighborhood' | 'food_cafe' | 'logistics' | undefined {
  const normalized = message.toLowerCase()

  if (/\b(cafe|cafes|cafés|comer|restaurante|gastronomia|lanche)\b/i.test(normalized)) {
    return 'food_cafe'
  }

  if (/\b(cultural|museu|arte|historia|história|visitar|passeio)\b/i.test(normalized)) {
    return 'attraction'
  }

  if (/\b(bairro|regiao|região|area|área)\b/i.test(normalized)) {
    return 'neighborhood'
  }

  if (/\b(logistica|logística|transporte|aeroporto|deslocamento)\b/i.test(normalized)) {
    return 'logistics'
  }

  return undefined
}

function resolveSuggestionLocation(
  message: string,
  currentState: TripState,
  extracted: ExtractedUpdate,
): { city?: string; regionHint?: string } {
  const explicitCity = extractExplicitCityForSuggestions(message)
  const explicitRegion = extractExplicitRegionHint(message)
  if (explicitRegion) {
    return {
      city: 'Recife',
      regionHint: explicitRegion,
    }
  }

  if (explicitCity) {
    return { city: explicitCity }
  }

  const focus = resolveCurrentFocus(currentState, extracted)
  if (focus?.city) {
    return { city: focus.city }
  }

  if (currentState.destination) {
    return { city: currentState.destination }
  }

  return {}
}

function extractExplicitCityForSuggestions(message: string): string | undefined {
  const explicit = message.match(
    /\b(?:em|no|na)\s+([a-zà-ÿ\s/.-]+?)(?=\s+\b(?:para|com|de|no|na)\b|[,.!?]|$)/i,
  )?.[1]
  if (!explicit) {
    return undefined
  }

  return normalizeCity(explicit)
}

function extractExplicitRegionHint(message: string): string | undefined {
  if (/\bboa viagem\b/i.test(message)) {
    return 'Boa Viagem'
  }

  return undefined
}

function clearSuggestionCache(state: TripState): TripState {
  return {
    ...state,
    conversationMeta: {
      ...state.conversationMeta,
      lastSuggestions: undefined,
      lastSuggestionsCity: undefined,
      lastSuggestionsRegion: undefined,
      lastSuggestionsQuery: undefined,
      lastSuggestionsAt: undefined,
    },
  }
}

function buildSuggestionsAssistantMessage(suggestions: GroundedSuggestions): string {
  const topItems = suggestions.items.slice(0, 3)
  const labels = topItems
    .map((item) => `${item.rank}. ${item.title} (${item.region})`)
    .join(' | ')

  return `Sugestoes grounded em ${suggestions.city}${suggestions.regionHint ? ` - ${suggestions.regionHint}` : ''}: ${labels}.`
}

function detectContextualReferenceType(
  message: string,
): 'destination' | 'stop' | 'generic' | undefined {
  if (/\b(nesse destino|neste destino)\b/i.test(message)) {
    return 'destination'
  }

  if (/\b(nessa parada|nesta parada)\b/i.test(message)) {
    return 'stop'
  }

  if (/\b(l[aá]|ali|aqui)\b/i.test(message)) {
    return 'generic'
  }

  return undefined
}

function extractDeltaDays(message: string): boolean {
  return /\bmais\s+\d+\s*dias?\b/i.test(message)
}

function applyDaysDeltaIfNeeded(params: {
  currentDaysTotal?: number
  incomingDays: number
  message: string
}): number {
  if (!extractDeltaDays(params.message) || !params.currentDaysTotal) {
    return params.incomingDays
  }

  return params.currentDaysTotal + params.incomingDays
}

function extractShortPlaceAnswer(message: string): string | undefined {
  const compact = message.replace(/\s+/g, ' ').trim()
  if (!compact || compact.length > 64) {
    return undefined
  }

  if (/\d/.test(compact)) {
    return undefined
  }

  if (/\b(quero|viajar|passar|parar|ficar|gosto|prefiro|evito|dias?)\b/i.test(compact)) {
    return undefined
  }

  const words = compact.split(' ').filter(Boolean)
  if (words.length > 4) {
    return undefined
  }

  const normalized = normalizeCity(compact)
  return normalized || undefined
}

function augmentSavedPlacesFromMessage(
  extracted: ExtractedUpdate,
  message: string,
  currentState: TripState,
): ExtractedUpdate {
  const suggestionIntent = extractSuggestionIntent(message)
  const addIntent = extractSavedPlaceAddIntent(message, currentState, extracted)
  const removeIntent = extractSavedPlaceRemoveIntent(
    message,
    currentState,
    extracted,
  )
  const listIntent = extractSavedPlacesListIntent(message, currentState)

  return {
    ...extracted,
    savedPlaceAdds: addIntent.adds,
    savedPlaceRemoves: removeIntent.removes,
    savedPlaceSaveReference: addIntent.saveReference,
    savedPlaceNeedsCity: addIntent.needsCity || removeIntent.needsCity,
    savedPlaceNeedsPlaceName:
      addIntent.needsPlaceName || removeIntent.needsPlaceName,
    savedPlaceNeedsSuggestionRefresh: addIntent.needsSuggestionRefresh,
    savedPlaceListIntent: listIntent.listRequested,
    savedPlaceListCity: listIntent.listCity,
    suggestionIntent: suggestionIntent.triggered,
    suggestionQuery: suggestionIntent.query,
  }
}

function extractSavedPlaceAddIntent(
  message: string,
  currentState: TripState,
  extracted: ExtractedUpdate,
): {
  adds: ExtractedSavedPlaceAdd[]
  saveReference?: ExtractedSuggestionSaveReference
  needsCity?: boolean
  needsPlaceName?: boolean
  needsSuggestionRefresh?: boolean
} {
  if (!/\b(salvar|salva|guardar|guarda|adiciona|adicionar|incluir|inclui)\b/i.test(message)) {
    return { adds: [] }
  }

  const suggestionSaveRef = extractSavedSuggestionReference(message)
  if (suggestionSaveRef) {
    const suggestionSaved = tryBuildSavedPlaceFromSuggestions({
      currentState,
      suggestionReference: suggestionSaveRef,
    })
    if (suggestionSaved.kind === 'resolved') {
      return {
        adds: [
          {
            city: suggestionSaved.city,
            placeName: suggestionSaved.placeName,
            note: suggestionSaved.note,
            source: 'retrieval',
          },
        ],
        saveReference: suggestionSaveRef,
      }
    }

    if (suggestionSaved.kind === 'stale') {
      return {
        adds: [],
        saveReference: suggestionSaveRef,
        needsSuggestionRefresh: true,
      }
    }

    return { adds: [], saveReference: suggestionSaveRef, needsPlaceName: true }
  }

  const normalizedMessage = message.replace(/\s+/g, ' ').trim()
  const explicitCityMatch = normalizedMessage.match(
    /\b(?:em|no|na)\s+([a-zà-ÿ\s/.-]+)$/i,
  )
  const explicitCityCandidate = explicitCityMatch?.[1]
    ? normalizeCity(explicitCityMatch[1])
    : undefined
  const explicitCity = isGenericContainerWord(explicitCityCandidate)
    ? undefined
    : explicitCityCandidate

  const rawPlaceMatch = normalizedMessage.match(
    /\b(?:salvar|salva|guardar|guarda|adiciona|adicionar|inclui|incluir)\s+(?:o|a|um|uma)?\s*(.+?)(?=\s+\b(?:em|no|na)\b|\s+\bno roteiro\b|$)/i,
  )
  const rawPlace = rawPlaceMatch?.[1]?.trim()
  const placeName = normalizePlaceName(rawPlace)
  const isPronounPlace = isContextualPlacePronoun(rawPlace ?? '')

  const resolvedCity =
    explicitCity ?? resolveCurrentFocus(currentState, extracted)?.city

  if (!resolvedCity) {
    return { adds: [], needsCity: true }
  }

  if (!placeName || isPronounPlace) {
    return { adds: [], needsPlaceName: true }
  }

  return {
    adds: [
      {
        city: resolvedCity,
        placeName,
        source: 'user',
      },
    ],
  }
}

function extractSavedSuggestionReference(
  message: string,
): ExtractedSuggestionSaveReference | undefined {
  const normalized = message.toLowerCase()
  if (
    !/\b(salvar|salva|guardar|guarda|adiciona|adicionar|incluir|inclui)\b/i.test(
      message,
    ) ||
    !/\b(opcao|opção)\b/i.test(message)
  ) {
    return undefined
  }

  if (/\b(primeira|1a|1ª|1)\s+op(c|ç)ao\b/i.test(normalized)) {
    return { ordinalIndex: 0 }
  }
  if (/\b(segunda|2a|2ª|2)\s+op(c|ç)ao\b/i.test(normalized)) {
    return { ordinalIndex: 1 }
  }
  if (/\b(terceira|3a|3ª|3)\s+op(c|ç)ao\b/i.test(normalized)) {
    return { ordinalIndex: 2 }
  }

  const numeric = normalized.match(/\bop(c|ç)ao\s+(\d+)\b/i)
  if (numeric?.[2]) {
    const parsed = Number(numeric[2])
    if (Number.isInteger(parsed) && parsed >= 1) {
      return { ordinalIndex: parsed - 1 }
    }
  }

  return undefined
}

function tryBuildSavedPlaceFromSuggestions(params: {
  currentState: TripState
  suggestionReference: ExtractedSuggestionSaveReference
}):
  | { kind: 'resolved'; city: string; placeName: string; note?: string }
  | { kind: 'missing' }
  | { kind: 'stale' } {
  const meta = params.currentState.conversationMeta
  const suggestions = meta?.lastSuggestions
  if (!suggestions || suggestions.length === 0) {
    return { kind: 'missing' }
  }

  if (isSuggestionCacheStale(meta?.lastSuggestionsAt)) {
    return { kind: 'stale' }
  }

  const selected = suggestions[params.suggestionReference.ordinalIndex]
  if (!selected) {
    return { kind: 'missing' }
  }

  return {
    kind: 'resolved',
    city: selected.city,
    placeName: selected.title,
    note: `${selected.category} - ${selected.region}`,
  }
}

function isSuggestionCacheStale(lastSuggestionsAt: string | undefined): boolean {
  if (!lastSuggestionsAt) {
    return true
  }

  const parsed = Date.parse(lastSuggestionsAt)
  if (!Number.isFinite(parsed)) {
    return true
  }

  return Date.now() - parsed > SUGGESTION_STALE_WINDOW_MS
}

function extractSavedPlaceRemoveIntent(
  message: string,
  currentState: TripState,
  extracted: ExtractedUpdate,
): {
  removes: ExtractedSavedPlaceRemove[]
  needsCity?: boolean
  needsPlaceName?: boolean
} {
  if (!/\b(remover|remove|tirar|tira|excluir|exclui|apagar|apaga)\b/i.test(message)) {
    return { removes: [] }
  }

  const normalizedMessage = message.replace(/\s+/g, ' ').trim()
  const explicitCityMatch = normalizedMessage.match(
    /\b(?:em|no|na)\s+([a-zà-ÿ\s/.-]+)$/i,
  )
  const explicitCityCandidate = explicitCityMatch?.[1]
    ? normalizeCity(explicitCityMatch[1])
    : undefined
  const explicitCity = isGenericContainerWord(explicitCityCandidate)
    ? undefined
    : explicitCityCandidate

  const rawPlaceMatch = normalizedMessage.match(
    /\b(?:remover|remove|tirar|tira|excluir|exclui|apagar|apaga)\s+(?:o|a|um|uma)?\s*(.+?)(?=\s+\b(?:em|no|na)\b|\s+\bda\s+minha\s+lista\b|\s+\bdo\s+roteiro\b|$)/i,
  )
  const rawPlace = rawPlaceMatch?.[1]?.trim()
  const placeName = normalizePlaceName(rawPlace)
  const isPronounPlace = isContextualPlacePronoun(rawPlace ?? '')

  const resolvedCity =
    explicitCity ?? resolveCurrentFocus(currentState, extracted)?.city

  if (!resolvedCity) {
    return { removes: [], needsCity: true }
  }

  if (!placeName || isPronounPlace) {
    return { removes: [], needsPlaceName: true }
  }

  return {
    removes: [
      {
        city: resolvedCity,
        placeName,
      },
    ],
  }
}

function isGenericContainerWord(value: string | undefined): boolean {
  if (!value) {
    return false
  }

  return ['Roteiro', 'Viagem', 'Destino'].includes(value)
}

function extractSavedPlacesListIntent(
  message: string,
  currentState: TripState,
): { listRequested: boolean; listCity?: string } {
  if (!/\b(lista|listar|mostra|mostrar|quais)\b/i.test(message)) {
    return { listRequested: false }
  }

  if (!/\b(lugares|locais|pontos|salvei|salvos)\b/i.test(message)) {
    return { listRequested: false }
  }

  const explicitCity = message.match(/\b(?:em|no|na)\s+([a-zà-ÿ\s/.-]+)$/i)?.[1]
  if (explicitCity) {
    return {
      listRequested: true,
      listCity: normalizeCity(explicitCity),
    }
  }

  const focusCity = currentState.conversationMeta?.currentFocusCity
  return {
    listRequested: true,
    listCity: focusCity,
  }
}

function normalizePlaceName(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const compact = value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^esse\s+lugar$/i, '')
    .replace(/^esse\s+local$/i, '')
    .replace(/^esse\s+ponto$/i, '')
    .replace(/[.,;:!?]+$/g, '')
    .trim()

  if (!compact) {
    return undefined
  }

  return compact
}

function isContextualPlacePronoun(value: string): boolean {
  return /\b(esse lugar|esse local|esse ponto|la|lá|ali)\b/i.test(value.trim())
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

function mapLlmExtractionToUpdate(llm: LlmStructuredExtraction): ExtractedUpdate {
  return {
    origin: llm.origin,
    destination: llm.destination,
    daysTotal: llm.daysTotal,
    stops: llm.stops.map((stop) => ({
      city: stop.city,
      stayDays: stop.stayDays,
      strongAppend: true,
    })),
    likes: llm.likes,
    dislikes: llm.dislikes,
    pace: llm.pace,
    budget: llm.budget,
    llmNextQuestion: llm.nextQuestion,
    llmPossibleMissingField: llm.possibleMissingField,
    llmConfidence: llm.confidence,
    savedPlaceAdds: [],
    savedPlaceRemoves: [],
    savedPlaceListIntent: false,
    suggestionIntent: false,
  }
}

function logExtractionMode(params: {
  env: ConversationUpdateRuntimeEnv
  event: 'llm_used' | 'fallback_used' | 'validation_failed'
  reason?: string
}): void {
  const debugEnabled = (params.env.CONVERSATION_LLM_DEBUG ?? '').toLowerCase() === 'true'
  if (!debugEnabled) {
    return
  }

  if (params.reason) {
    console.log(`[conversation-update] ${params.event} reason=${params.reason}`)
    return
  }

  console.log(`[conversation-update] ${params.event}`)
}

function parseMinConfidence(raw?: string): number {
  const parsed = Number(raw ?? '')
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
    return parsed
  }
  return 0.45
}

function isLowConfidence(confidence: number | undefined, minConfidence: number): boolean {
  if (confidence === undefined) {
    return false
  }

  return confidence < minConfidence
}

function extractDaysTotal(lowerMessage: string): number | undefined {
  const patterns = [
    /\b(?:por|durante)\s+(\d+)\s*dias?\b/i,
    /\bem\s+(\d+)\s*dias?\b/i,
    /\b(?:vou\s+passar|passarei|serao|serão|sera|será|ficarei)\s+(\d+)\s*dias?\b/i,
    /\b(?:viagem|roteiro)\s+(?:de\s+)?(\d+)\s*dias?\b/i,
    /\bquero\s+(\d+)\s*dias?\b/i,
    /\b(\d+)\s*dias?\s+de\s+viagem\b/i,
  ]

  for (const pattern of patterns) {
    const match = lowerMessage.match(pattern)
    if (match?.[1]) {
      return Number(match[1])
    }
  }

  return undefined
}

function extractStops(message: string): ExtractedStopMention[] {
  type RawStopMention = ExtractedStopMention & { index: number }

  const mentions: RawStopMention[] = []
  const routePatterns = [
    /\bpass(?:ar|ando)\s+por\s+([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+){0,2}?)(?=\s+(?:e\b|depois\b|para\b|pra\b|até\b|ate\b|no\b|na\b)|[,.!?]|$)/gi,
    /\bpar(?:ar|ando)\s+em\s+([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+){0,2}?)(?=\s+(?:e\b|depois\b|para\b|pra\b|até\b|ate\b|no\b|na\b)|[,.!?]|$)/gi,
    /\b(?:adiciona|adicione|adicionar|inclui|inclua|incluir)\s+([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+){0,2})\s+(?:ao|a|no)\s+roteiro\b/gi,
  ]

  routePatterns.forEach((pattern) => {
    for (const match of message.matchAll(pattern)) {
      const city = normalizeCity(match[1] ?? '')
      if (!city || /\d/.test(city)) {
        continue
      }

      mentions.push({
        city,
        strongAppend: true,
        index: match.index ?? Number.MAX_SAFE_INTEGER,
      })
    }
  })

  const stayPatterns = [
    /\b(?:fic(?:ar|ando)|pass(?:ar|ando))\s+(\d+)\s*dias?\s+em\s+([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+){0,2}?)(?=\s+(?:e\b|no\b|na\b|para\b|pra\b|até\b|ate\b)|[,.!?]|$)/gi,
    /\b(\d+)\s*dias?\s+em\s+([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+){0,2}?)(?=\s+(?:e\b|no\b|na\b|para\b|pra\b|até\b|ate\b)|[,.!?]|$)/gi,
  ]

  stayPatterns.forEach((pattern) => {
    for (const match of message.matchAll(pattern)) {
      const stayDays = Number(match[1])
      const city = normalizeCity(match[2] ?? '')

      if (!city || !Number.isInteger(stayDays) || stayDays < 1) {
        continue
      }

      mentions.push({
        city,
        stayDays,
        strongAppend: true,
        index: match.index ?? Number.MAX_SAFE_INTEGER,
      })
    }
  })

  mentions.sort((a, b) => a.index - b.index)

  const mergedByCity = new Map<string, ExtractedStopMention>()

  mentions.forEach((mention) => {
    const key = mention.city.toLowerCase()
    const existing = mergedByCity.get(key)

    if (!existing) {
      mergedByCity.set(key, {
        city: mention.city,
        stayDays: mention.stayDays,
        deltaStayDays: mention.deltaStayDays,
        strongAppend: mention.strongAppend,
      })
      return
    }

    mergedByCity.set(key, {
      ...existing,
      stayDays: mention.stayDays ?? existing.stayDays,
      deltaStayDays: mention.deltaStayDays ?? existing.deltaStayDays,
      strongAppend: existing.strongAppend || mention.strongAppend,
    })
  })

  return [...mergedByCity.values()]
}

function normalizeCity(value: string): string {
  const compactBase = value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^praia\s+de\s+/i, '')
    .replace(/\s*\/\s*[a-z]{2}\b.*$/i, '')
    .replace(/\s*-\s*[a-z]{2}\b.*$/i, '')
    .replace(/\s+e\s+seguir.*$/i, '')
    .replace(/\s+e\s+depois.*$/i, '')
    .replace(/\s+no\s+caminho.*$/i, '')
    .replace(/[.,;:!?]+$/g, '')
    .trim()

  const compact = stripCityTailNoise(compactBase)
  if (!compact) {
    return ''
  }

  return compact
    .split(' ')
    .map((part, index) => {
      const lowerPart = part.toLowerCase()
      if (
        index > 0 &&
        ['de', 'da', 'do', 'das', 'dos', 'e'].includes(lowerPart)
      ) {
        return lowerPart
      }

      return lowerPart[0].toUpperCase() + lowerPart.slice(1)
    })
    .join(' ')
}

function stripCityTailNoise(value: string): string {
  const noiseTokens = new Set([
    'vou',
    'quero',
    'pretendo',
    'passar',
    'ficar',
    'seguir',
    'viajar',
    'serao',
    'serão',
    'sera',
    'será',
  ])

  const parts = value.split(' ').filter(Boolean)
  while (parts.length > 1) {
    const tail = parts[parts.length - 1]?.toLowerCase()
    if (!tail || !noiseTokens.has(tail)) {
      break
    }
    parts.pop()
  }

  return parts.join(' ').trim()
}

function extractPreferenceItems(message: string, pattern: RegExp): string[] {
  const collected: string[] = []

  for (const match of message.matchAll(pattern)) {
    const phrase = (match[1] ?? '').trim()
    if (!phrase) {
      continue
    }

    phrase
      .split(/,| e /i)
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length >= 3)
      .filter((item) => !/^(nao|não)\b/.test(item))
      .forEach((item) => {
        if (!collected.includes(item)) {
          collected.push(item)
        }
      })
  }

  return collected
}

function extractPace(lowerMessage: string): TripState['preferences']['pace'] {
  if (/\b(tranquil[a-z]*|devagar|sem pressa)\b/.test(lowerMessage)) {
    return 'slow'
  }

  if (/\b(corrid[a-z]*|rapid[a-z]*)\b/.test(lowerMessage)) {
    return 'fast'
  }

  if (/\b(moderad|equilibrad)\b/.test(lowerMessage)) {
    return 'moderate'
  }

  return undefined
}

function extractBudget(
  lowerMessage: string,
): TripState['preferences']['budget'] {
  if (/\b(econom[a-z]*|barat[a-z]*|baixo custo)\b/.test(lowerMessage)) {
    return 'low'
  }

  if (/\b(luxo|premium|alto padrao|alto padrão)\b/.test(lowerMessage)) {
    return 'high'
  }

  if (/\b(medi[oa]|intermediari[oa]|custo medio|custo médio)\b/.test(lowerMessage)) {
    return 'medium'
  }

  return undefined
}

function parseConversationUpdateInput(
  value: unknown,
): ConversationTripUpdateInput | null {
  if (!isRecord(value)) {
    return null
  }

  const { message, tripState } = value

  if (typeof message !== 'string' || message.trim() === '') {
    return null
  }

  if (tripState !== undefined && !isRecord(tripState)) {
    return null
  }

  return {
    message: message.trim(),
    tripState: tripState as TripState | undefined,
  }
}

function getCurrentMissingField(tripState: TripState): MissingField {
  if (!tripState.origin) {
    return 'origin'
  }

  if (!tripState.destination) {
    return 'destination'
  }

  if (!tripState.daysTotal) {
    return 'daysTotal'
  }

  return undefined
}

function getQuestionByMissingField(
  missingField: ConversationAskField | MissingField,
): string | undefined {
  if (missingField === 'origin') {
    return 'De qual cidade voce vai sair?'
  }

  if (missingField === 'destination') {
    return 'Qual e o destino principal da viagem?'
  }

  if (missingField === 'daysTotal') {
    return 'Quantos dias voce quer para essa viagem?'
  }

  if (missingField === 'stop_stay_days') {
    return 'Voce quer definir quantos dias em cada parada que mencionou?'
  }

  if (missingField === 'saved_place_city') {
    return 'Em qual cidade fica esse lugar?'
  }

  if (missingField === 'saved_place_name') {
    return 'Qual lugar voce quer adicionar ou remover?'
  }

  return undefined
}

function logConversationUpdateDebug(params: {
  env: ConversationUpdateRuntimeEnv
  previousState: TripState
  missingField: MissingField
  previousAskedField?: ConversationAskField
  message: string
  extracted: ExtractedUpdate
  nextState: TripState
  finalUnresolvedFields: ConversationAskField[]
  finalAskedField?: ConversationAskField
  updatedField?: ConversationAskField
  focusCity?: string
  assistantMessage?: string
  nextQuestion?: string
}): void {
  const debugEnabled =
    (params.env.CONVERSATION_UPDATE_DEBUG ?? '').toLowerCase() === 'true'

  if (!debugEnabled) {
    return
  }

  console.log(
    `[conversation-update] flow previous=${JSON.stringify(summarizeTripState(params.previousState))} previousAskedField=${params.previousAskedField ?? 'none'} missingField=${params.missingField ?? 'none'} message=${JSON.stringify(params.message)} extracted=${JSON.stringify(summarizeExtractedUpdate(params.extracted))} focusCity=${JSON.stringify(params.focusCity)} updatedField=${params.updatedField ?? 'none'} next=${JSON.stringify(summarizeTripState(params.nextState))} unresolved=${JSON.stringify(params.finalUnresolvedFields)} finalAskedField=${params.finalAskedField ?? 'none'} assistantMessage=${JSON.stringify(params.assistantMessage)} nextQuestion=${JSON.stringify(params.nextQuestion)}`,
  )
}

function logConversationStage(
  env: ConversationUpdateRuntimeEnv,
  stage:
    | 'extractConversationSignals'
    | 'normalizeEntities'
    | 'resolveContextualReferences'
    | 'resolveGroundedSuggestions'
    | 'mergeTripState'
    | 'decideNextAction',
  payload?: Record<string, unknown>,
): void {
  const debugEnabled =
    (env.CONVERSATION_UPDATE_DEBUG ?? '').toLowerCase() === 'true'

  if (!debugEnabled) {
    return
  }

  if (!payload) {
    console.log(`[conversation-update] stage=${stage}`)
    return
  }

  console.log(
    `[conversation-update] stage=${stage} payload=${JSON.stringify(payload)}`,
  )
}

function summarizeTripState(tripState: TripState): Record<string, unknown> {
  return {
    origin: tripState.origin,
    destination: tripState.destination,
    daysTotal: tripState.daysTotal,
    stops: tripState.stops.map((stop) => ({
      city: stop.city,
      stayDays: stop.stayDays,
    })),
    savedPlacesByCity: tripState.savedPlacesByCity.map((entry) => ({
      city: entry.city,
      places: entry.places.map((place) => place.placeName),
    })),
    conversationMeta: {
      lastAskedField: tripState.conversationMeta?.lastAskedField,
      askedFieldsRecent: tripState.conversationMeta?.askedFieldsRecent,
      lastResolvedField: tripState.conversationMeta?.lastResolvedField,
      lastUserMessage:
        tripState.conversationMeta?.lastUserMessage ??
        tripState.conversationMeta?.lastUserTurn,
      conversationStage: tripState.conversationMeta?.conversationStage,
      unresolvedFields: tripState.conversationMeta?.unresolvedFields,
      confidenceByField: tripState.conversationMeta?.confidenceByField,
      currentFocusCity: tripState.conversationMeta?.currentFocusCity,
      currentFocusField: tripState.conversationMeta?.currentFocusField,
      lastSuggestionsCount: tripState.conversationMeta?.lastSuggestions?.length,
      lastSuggestionsCity: tripState.conversationMeta?.lastSuggestionsCity,
      lastSuggestionsRegion: tripState.conversationMeta?.lastSuggestionsRegion,
      lastSuggestionsQuery: tripState.conversationMeta?.lastSuggestionsQuery,
      lastSuggestionsAt: tripState.conversationMeta?.lastSuggestionsAt,
      lastUserTurn: tripState.conversationMeta?.lastUserTurn,
    },
  }
}

function summarizeExtractedUpdate(extracted: ExtractedUpdate): Record<string, unknown> {
  return {
    origin: extracted.origin,
    destination: extracted.destination,
    daysTotal: extracted.daysTotal,
    stops: extracted.stops.map((stop) => ({
      city: stop.city,
      stayDays: stop.stayDays,
      deltaStayDays: stop.deltaStayDays,
      strongAppend: stop.strongAppend,
    })),
    likes: extracted.likes,
    dislikes: extracted.dislikes,
    pace: extracted.pace,
    budget: extracted.budget,
    savedPlaceAdds: extracted.savedPlaceAdds,
    savedPlaceRemoves: extracted.savedPlaceRemoves,
    savedPlaceListIntent: extracted.savedPlaceListIntent,
    savedPlaceListCity: extracted.savedPlaceListCity,
    savedPlaceNeedsCity: extracted.savedPlaceNeedsCity,
    savedPlaceNeedsPlaceName: extracted.savedPlaceNeedsPlaceName,
    savedPlaceNeedsSuggestionRefresh: extracted.savedPlaceNeedsSuggestionRefresh,
    savedPlaceSaveReference: extracted.savedPlaceSaveReference,
    suggestionIntent: extracted.suggestionIntent,
    suggestionQuery: extracted.suggestionQuery,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
