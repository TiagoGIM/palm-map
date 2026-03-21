import type { GroundedSuggestionItem, GroundedSuggestions, TripState } from '../../packages/shared-types'
import { retrieveLocalRecifeV1WithContext } from '../../packages/domain-retrieval/retrieve-local'
import { normalizeCity } from './conversation-city-utils'
import {
  type ConversationUpdateRuntimeEnv,
  type ExtractedUpdate,
  CONVERSATION_RETRIEVE_TOP_K,
} from './conversation-types'
import { logConversationStage } from './conversation-logging'
import { resolveCurrentFocus } from './conversation-merge'
import { buildSuggestionsAssistantMessage } from './conversation-decide'

export function resolveGroundedSuggestions(params: {
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

function resolveSuggestionLocation(
  message: string,
  currentState: TripState,
  extracted: ExtractedUpdate,
): { city?: string; regionHint?: string } {
  const explicitRegion = extractExplicitRegionHint(message)
  if (explicitRegion) {
    return { city: 'Recife', regionHint: explicitRegion }
  }

  const explicitCity = extractExplicitCityForSuggestions(message)
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
