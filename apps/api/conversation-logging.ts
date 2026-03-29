import type { ConversationAskField, TripState } from '../../packages/shared-types'
import type {
  ConversationUpdateRuntimeEnv,
  ExtractedUpdate,
  MissingField,
} from './conversation-types'

export function parseMinConfidence(raw?: string): number {
  const parsed = Number(raw ?? '')
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
    return parsed
  }
  return 0.45
}

export function isLowConfidence(
  confidence: number | undefined,
  minConfidence: number,
): boolean {
  if (confidence === undefined) {
    return false
  }
  return confidence < minConfidence
}

export function logExtractionMode(params: {
  env: ConversationUpdateRuntimeEnv
  event: 'llm_used' | 'fallback_used' | 'validation_failed'
  reason?: string
}): void {
  // extraction_mode is always logged (production signal for LLM performance)
  const entry: Record<string, unknown> = {
    svc: 'conversation',
    event: 'extraction_mode',
    mode: params.event,
  }
  if (params.reason) entry['reason'] = params.reason
  console.log(JSON.stringify(entry))
}

export function logConversationStage(
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
  if (!debugEnabled) return

  const entry: Record<string, unknown> = { svc: 'conversation', event: 'stage', stage }
  if (payload) entry['payload'] = payload
  console.log(JSON.stringify(entry))
}

export function logConversationUpdateDebug(params: {
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

  console.log(JSON.stringify({
    svc: 'conversation',
    event: 'flow',
    previous: summarizeTripState(params.previousState),
    previousAskedField: params.previousAskedField ?? null,
    missingField: params.missingField ?? null,
    message: params.message,
    extracted: summarizeExtractedUpdate(params.extracted),
    focusCity: params.focusCity ?? null,
    updatedField: params.updatedField ?? null,
    next: summarizeTripState(params.nextState),
    unresolved: params.finalUnresolvedFields,
    finalAskedField: params.finalAskedField ?? null,
    assistantMessage: params.assistantMessage ?? null,
    nextQuestion: params.nextQuestion ?? null,
  }))
}

export function summarizeTripState(tripState: TripState): Record<string, unknown> {
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

export function summarizeExtractedUpdate(
  extracted: ExtractedUpdate,
): Record<string, unknown> {
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
