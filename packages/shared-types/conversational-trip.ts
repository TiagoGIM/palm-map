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
  savedPlaces?: string[]
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

/** Central state for the conversational MVP flow. */
export type TripState = {
  origin?: string
  destination?: string
  daysTotal?: number
  stops: TripStop[]
  preferences: UserPreferenceMemory
  notes?: string
  conversationMeta?: ConversationMeta
}

export type ConversationAskField =
  | 'origin'
  | 'destination'
  | 'stop_stay_days'
  | 'daysTotal'

export type ConversationMeta = {
  lastAskedField?: ConversationAskField
  askedFieldsRecent?: ConversationAskField[]
  lastUserTurn?: string
}

/** Free-form user message used to update the conversational TripState. */
export type ConversationTripUpdateInput = {
  message: string
  tripState?: TripState
}

/** Result of a conversational update with partial state and next question. */
export type ConversationTripUpdateResult = {
  tripState: TripState
  nextQuestion?: string
  suggestedRoute?: SuggestedRoute
}
