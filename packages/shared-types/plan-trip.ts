/** Input accepted by the MVP plan-trip flow. */
export type PlanTripInput = {
  /** City or place where the trip starts. */
  origin: string
  /** Destination used to retrieve grounded place options. */
  destination: string
  /** Number of days the planner should organize. */
  days: number
  /** Free-text preferences explicitly provided by the user. */
  preferencesText?: string
}

/** Grounded place option returned by retrieval and reused by the planner. */
export type PlaceCandidate = {
  name: string
  /** Human-readable place location for display and basic planning. */
  location: string
  /** Source identifier used to trace where this item came from. */
  source: string
  /** Confidence score from 0 to 1 for the retrieved item. */
  confidence: number
  id?: string
}

/** Minimal plan for a single trip day. */
export type DayPlan = {
  /** Sequential day number inside the trip result. */
  day: number
  /** Retrieved places or activities assigned to this day. */
  items: PlaceCandidate[]
}

/** Result returned by the MVP plan-trip flow. */
export type PlanTripResult = {
  days: DayPlan[]
  /** Optional notes when fixture or retrieval data is incomplete. */
  warnings?: string[]
}
