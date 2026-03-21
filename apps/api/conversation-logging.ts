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
  const debugEnabled =
    (params.env.CONVERSATION_LLM_DEBUG ?? '').toLowerCase() === 'true'
  if (!debugEnabled) {
    return
  }

  if (params.reason) {
    console.log(`[conversation-update] ${params.event} reason=${params.reason}`)
    return
  }

  console.log(`[conversation-update] ${params.event}`)
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

  console.log(
    `[conversation-update] flow previous=${JSON.stringify(summarizeTripState(params.previousState))} previousAskedField=${params.previousAskedField ?? 'none'} missingField=${params.missingField ?? 'none'} message=${JSON.stringify(params.message)} extracted=${JSON.stringify(summarizeExtractedUpdate(params.extracted))} focusCity=${JSON.stringify(params.focusCity)} updatedField=${params.updatedField ?? 'none'} next=${JSON.stringify(summarizeTripState(params.nextState))} unresolved=${JSON.stringify(params.finalUnresolvedFields)} finalAskedField=${params.finalAskedField ?? 'none'} assistantMessage=${JSON.stringify(params.assistantMessage)} nextQuestion=${JSON.stringify(params.nextQuestion)}`,
  )
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
