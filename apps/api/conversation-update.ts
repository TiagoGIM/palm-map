import type {
  ConversationAskField,
  ConversationTripUpdateInput,
  ConversationTripUpdateResult,
  TripState,
} from '../../packages/shared-types'
import type { ConversationLlmEnv } from './conversation-llm-adapter'
import {
  type ConversationUpdateRuntimeEnv,
  type ExtractedUpdate,
  type MissingField,
} from './conversation-types'
import { extractFromMessage } from './conversation-extract'
import {
  applyContextualPlaceReferences,
  applyContextualShortAnswer,
  createBaseTripState,
  mergeTripState,
} from './conversation-merge'
import {
  buildConversationMeta,
  buildSuggestedRoute,
  buildTripLegs,
  chooseNextQuestion,
  getLastResolvedField,
  getTurnProgress,
} from './conversation-decide'
import { resolveGroundedSuggestions } from './conversation-retrieve'
import {
  logConversationStage,
  logConversationUpdateDebug,
  summarizeExtractedUpdate,
  summarizeTripState,
} from './conversation-logging'

export type { ConversationUpdateRuntimeEnv }
export type { ConversationLlmEnv }

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

// Pipeline stages — thin wrappers that add stage logging around module calls.

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

function decideNextAction(params: {
  env: ConversationUpdateRuntimeEnv
  previousState: TripState
  nextState: TripState
  extracted: ExtractedUpdate
  userMessage: string
  groundedResolution: {
    groundedSuggestions?: ReturnType<typeof resolveGroundedSuggestions>['groundedSuggestions']
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

// Input parsing utilities

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
  if (!tripState.origin) return 'origin'
  if (!tripState.destination) return 'destination'
  if (!tripState.daysTotal) return 'daysTotal'
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
