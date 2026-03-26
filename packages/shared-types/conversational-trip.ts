/** Memory explicitly declared by the user for conversational planning. */
export type UserPreferenceMemory = {
  likes: string[]
  dislikes: string[]
  pace?: 'slow' | 'moderate' | 'fast'
  budget?: 'low' | 'medium' | 'high'
}

/** Minimal stop representation used in the conversational TripState. */
export type TripStop = {
  city: string
  stayDays?: number
}

export type SavedPlaceSource = 'user' | 'retrieval'

export type SavedPlace = {
  placeName: string
  note?: string
  source: SavedPlaceSource
}

export type CitySavedPlaces = {
  city: string
  places: SavedPlace[]
}

export type SuggestedRouteNode = {
  city: string
  role: 'origin' | 'stop' | 'destination'
  stayDays?: number
}

export type SuggestedRoute = {
  nodes: SuggestedRouteNode[]
  daysTotal?: number
}

export type TripLeg = {
  fromCity: string
  toCity: string
  order: number
  stayDaysAtDestination?: number
}

/** Central state for the conversational MVP flow. */
export type TripState = {
  origin?: string
  destination?: string
  daysTotal?: number
  stops: TripStop[]
  savedPlacesByCity: CitySavedPlaces[]
  preferences: UserPreferenceMemory
  notes?: string
  conversationMeta?: ConversationMeta
}

export type ConversationAskField =
  | 'origin'
  | 'destination'
  | 'stop_stay_days'
  | 'daysTotal'
  | 'saved_place_city'
  | 'saved_place_name'

export type ConversationStage =
  | 'collecting_core'
  | 'collecting_details'
  | 'ready_to_suggest'

export type FieldConfidence = Partial<Record<ConversationAskField, number>>

export type ConversationFocusField = 'origin' | 'destination' | 'stop'

export type GroundedSuggestionItem = {
  rank: number
  city: string
  region: string
  title: string
  category: 'attraction' | 'neighborhood' | 'food_cafe' | 'logistics'
  summary: string
  source: string
  score: number
  docId: string
  chunkId: string
}

export type GroundedSuggestions = {
  city: string
  query: string
  topK: number
  regionHint?: string
  items: GroundedSuggestionItem[]
}

export type ConversationMeta = {
  lastAskedField?: ConversationAskField
  askedFieldsRecent?: ConversationAskField[]
  lastResolvedField?: ConversationAskField
  lastUserMessage?: string
  // Backward-compatible alias used in earlier turns.
  lastUserTurn?: string
  conversationStage?: ConversationStage
  confidenceByField?: FieldConfidence
  unresolvedFields?: ConversationAskField[]
  currentFocusCity?: string
  currentFocusField?: ConversationFocusField
  lastSuggestions?: GroundedSuggestionItem[]
  lastSuggestionsCity?: string
  lastSuggestionsRegion?: string
  lastSuggestionsQuery?: string
  lastSuggestionsAt?: string
  /**
   * Indica se as preferências atuais foram reaproveitadas do contexto anterior.
   */
  preferencesReused?: boolean
}

/** Free-form user message used to update the conversational TripState. */
export type ConversationTripUpdateInput = {
  message: string
  tripState?: TripState
}

/** Result of a conversational update with partial state and next question. */
export type ConversationTripUpdateResult = {
  tripState: TripState
  assistantMessage?: string
  nextQuestion?: string
  suggestedRoute?: SuggestedRoute
  tripLegs?: TripLeg[]
  groundedSuggestions?: GroundedSuggestions
}
