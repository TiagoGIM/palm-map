import type {
  ConversationAskField,
  ConversationMeta,
  ConversationTripUpdateInput,
  ConversationTripUpdateResult,
  SuggestedRoute,
  TripState,
} from '../../packages/shared-types'
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
  const extractedFromMessage = await extractFromMessage({
    message: input.message,
    tripState: baseState,
    env,
  })
  const extracted = applyContextualShortAnswer({
    currentState: baseState,
    missingField: missingFieldBeforeMerge,
    message: input.message,
    extracted: extractedFromMessage,
  })
  const mergedState = mergeTripState(baseState, extracted)
  const nextQuestionDecision = chooseNextQuestion({
    previousState: baseState,
    nextState: mergedState,
    extracted,
    userMessage: input.message,
  })
  const nextQuestion = nextQuestionDecision.nextQuestion
  const nextTripState: TripState = {
    ...mergedState,
    conversationMeta: buildConversationMeta({
      previousMeta: baseState.conversationMeta,
      userMessage: input.message,
      askedField: nextQuestionDecision.askedField,
    }),
  }
  const suggestedRoute = buildSuggestedRoute(nextTripState)
  logConversationUpdateDebug({
    env,
    previousState: baseState,
    missingField: missingFieldBeforeMerge,
    message: input.message,
    nextState: nextTripState,
    askedField: nextQuestionDecision.askedField,
    nextQuestion,
  })

  return {
    status: 200,
    body: {
      tripState: nextTripState,
      nextQuestion,
      suggestedRoute,
    },
  }
}

type ExtractedStopMention = {
  city: string
  stayDays?: number
  strongAppend: boolean
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
}

type MissingField = 'origin' | 'destination' | 'daysTotal' | undefined

function createBaseTripState(tripState?: TripState): TripState {
  return {
    ...tripState,
    stops: tripState?.stops ?? [],
    preferences: {
      likes: tripState?.preferences?.likes ?? [],
      dislikes: tripState?.preferences?.dislikes ?? [],
      pace: tripState?.preferences?.pace,
      budget: tripState?.preferences?.budget,
    },
    conversationMeta: {
      lastAskedField: tripState?.conversationMeta?.lastAskedField,
      askedFieldsRecent: tripState?.conversationMeta?.askedFieldsRecent ?? [],
      lastUserTurn: tripState?.conversationMeta?.lastUserTurn,
    },
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
      stayDays: mention.stayDays,
    })
  })

  return nextStops
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
}): { askedField?: ConversationAskField; nextQuestion?: string } {
  const candidateField = getNextCandidateField(params.nextState)
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
  if (previousAskedField === candidateField) {
    const repeatedUserTurn =
      params.previousState.conversationMeta?.lastUserTurn?.trim().toLowerCase() ===
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

  return {
    askedField: candidateField,
    nextQuestion: getQuestionByMissingField(candidateField),
  }
}

function getNextCandidateField(tripState: TripState): ConversationAskField | undefined {
  if (!tripState.origin) {
    return 'origin'
  }

  if (!tripState.destination) {
    return 'destination'
  }

  if (
    tripState.origin.toLowerCase() === tripState.destination.toLowerCase()
  ) {
    return 'destination'
  }

  const stopWithoutStay = tripState.stops.find((stop) => stop.stayDays === undefined)
  if (stopWithoutStay && !tripState.daysTotal) {
    return 'stop_stay_days'
  }

  if (!tripState.daysTotal) {
    return 'daysTotal'
  }

  return undefined
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
}): ConversationMeta {
  const previousRecent = params.previousMeta?.askedFieldsRecent ?? []
  const nextRecent = params.askedField
    ? [...previousRecent, params.askedField].slice(-5)
    : previousRecent

  return {
    lastAskedField: params.askedField,
    askedFieldsRecent: nextRecent,
    lastUserTurn: params.userMessage,
  }
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
    return extractHeuristicFromMessage(params.message)
  }

  if (isLowConfidence(llmResult.extraction.confidence, minConfidence)) {
    logExtractionMode({
      env: params.env,
      event: 'fallback_used',
      reason: 'low_confidence',
    })
    return extractHeuristicFromMessage(params.message)
  }

  logExtractionMode({
    env: params.env,
    event: 'llm_used',
  })

  return mapLlmExtractionToUpdate(llmResult.extraction)
}

function extractHeuristicFromMessage(message: string): ExtractedUpdate {
  const lower = message.toLowerCase()
  const fullRoute = message.match(
    /\bde\s+([a-zà-ÿ\s/.-]+?)\s+(?:para|pra|até|ate|a)\s+([a-zà-ÿ\s/.-]+?)(?=\s+\b(?:por|em|com|no|na)\b|[,.!?]|$)/i,
  )
  const originOnly = message.match(
    /\b(?:saindo de|partindo de|de)\s+([a-zà-ÿ\s/.-]+?)(?=\s+\b(?:e|depois|para|pra|até|ate|a)\b|[,.!?]|$)/i,
  )
  const destinationOnly = message.match(
    /\b(?:para|pra|até|ate)\s+([a-zà-ÿ\s/.-]+?)(?=\s+\b(?:por|em|com|no|na|e)\b|[,.!?]|$)/i,
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

  return {
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
  }
}

function applyContextualShortAnswer(params: {
  currentState: TripState
  missingField: MissingField
  message: string
  extracted: ExtractedUpdate
}): ExtractedUpdate {
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
        strongAppend: mention.strongAppend,
      })
      return
    }

    mergedByCity.set(key, {
      ...existing,
      stayDays: mention.stayDays ?? existing.stayDays,
      strongAppend: existing.strongAppend || mention.strongAppend,
    })
  })

  return [...mergedByCity.values()]
}

function normalizeCity(value: string): string {
  const compact = value
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

  return undefined
}

function logConversationUpdateDebug(params: {
  env: ConversationUpdateRuntimeEnv
  previousState: TripState
  missingField: MissingField
  message: string
  nextState: TripState
  askedField?: ConversationAskField
  nextQuestion?: string
}): void {
  const debugEnabled =
    (params.env.CONVERSATION_UPDATE_DEBUG ?? '').toLowerCase() === 'true'

  if (!debugEnabled) {
    return
  }

  console.log(
    `[conversation-update] flow previous=${JSON.stringify(summarizeTripState(params.previousState))} missingField=${params.missingField ?? 'none'} message=${JSON.stringify(params.message)} askedField=${params.askedField ?? 'none'} nextQuestion=${JSON.stringify(params.nextQuestion)} next=${JSON.stringify(summarizeTripState(params.nextState))}`,
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
    conversationMeta: {
      lastAskedField: tripState.conversationMeta?.lastAskedField,
      askedFieldsRecent: tripState.conversationMeta?.askedFieldsRecent,
      lastUserTurn: tripState.conversationMeta?.lastUserTurn,
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
