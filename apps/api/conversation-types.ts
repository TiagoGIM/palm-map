import type { TripState } from '../../packages/shared-types'
import type { ConversationLlmEnv } from './conversation-llm-adapter'
import type { D1Database } from '../../packages/domain-memory'

export type ConversationUpdateRuntimeEnv = ConversationLlmEnv & {
  CONVERSATION_LLM_DEBUG?: string
  CONVERSATION_UPDATE_DEBUG?: string
  CONVERSATION_LLM_MIN_CONFIDENCE?: string
  /** D1 database binding — only present when the Cloudflare D1 resource is configured. */
  PALM_MAP_DB?: D1Database
}

export type MissingField = 'origin' | 'destination' | 'daysTotal' | undefined

export type ExtractedStopMention = {
  city: string
  stayDays?: number
  deltaStayDays?: number
  strongAppend: boolean
}

export type ExtractedSavedPlaceAdd = {
  city?: string
  placeName?: string
  note?: string
  source?: 'user' | 'retrieval'
}

export type ExtractedSavedPlaceRemove = {
  city?: string
  placeName?: string
}

export type ExtractedSuggestionSaveReference = {
  ordinalIndex: number
}

export type ExtractedUpdate = {
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

export const CONVERSATION_RETRIEVE_TOP_K = 3
export const SUGGESTION_STALE_WINDOW_MS = 10 * 60 * 1000
