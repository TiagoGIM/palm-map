import type {
  DayPlan,
  PlanTripInput,
  PlanTripResult,
  PlaceCandidate,
} from '../../packages/shared-types/plan-trip.ts'
import type { GroundedSuggestionItem, TripState } from '../../packages/shared-types/conversational-trip.ts'

type FixturePlace = {
  name: string
  location: string
  source: string
  confidence: number
}

const fixtureData: Record<string, FixturePlace[]> = {
  recife: [
    {
      name: 'Marco Zero',
      location: 'Recife Antigo, Recife, PE',
      source: 'mock-guide:recife-v1',
      confidence: 0.96,
    },
    {
      name: 'Praia de Boa Viagem',
      location: 'Boa Viagem, Recife, PE',
      source: 'mock-guide:recife-v1',
      confidence: 0.95,
    },
    {
      name: 'Parque Dona Lindu',
      location: 'Boa Viagem, Recife, PE',
      source: 'mock-guide:recife-v1',
      confidence: 0.88,
    },
    {
      name: 'Instituto Ricardo Brennand',
      location: 'Várzea, Recife, PE',
      source: 'mock-guide:recife-v1',
      confidence: 0.94,
    },
    {
      name: 'Oficina Ceramica Francisco Brennand',
      location: 'Várzea, Recife, PE',
      source: 'mock-guide:recife-v1',
      confidence: 0.9,
    },
    {
      name: 'Cais do Sertao',
      location: 'Recife Antigo, Recife, PE',
      source: 'mock-guide:recife-v1',
      confidence: 0.91,
    },
    {
      name: 'Paco do Frevo',
      location: 'Recife Antigo, Recife, PE',
      source: 'mock-guide:recife-v1',
      confidence: 0.9,
    },
  ],
}

let storedPreferencesText: string | undefined

function resolveEffectivePreferencesText(
  explicitPreferencesText: string | undefined,
): string | undefined {
  if (explicitPreferencesText !== undefined) {
    storedPreferencesText = explicitPreferencesText
    return explicitPreferencesText
  }

  return storedPreferencesText
}

type ApiErrorBody = {
  error: {
    code: 'invalid_request' | 'fixtures_not_found'
    message: string
  }
}

type ApiSuccessResponse = {
  status: 200
  body: PlanTripResult
}

type ApiErrorResponse = {
  status: 400 | 404
  body: ApiErrorBody
}

export type PlanTripHttpResponse = ApiSuccessResponse | ApiErrorResponse

export async function handlePlanTrip(
  requestBody: unknown,
): Promise<PlanTripHttpResponse> {
  const input = parsePlanTripInput(requestBody)

  if (!input) {
    return {
      status: 400,
      body: {
        error: {
          code: 'invalid_request',
          message: 'Request body must match PlanTripInput.',
        },
      },
    }
  }

  const effectivePreferencesText = resolveEffectivePreferencesText(
    input.preferencesText,
  )

  const savedPlaces = getSavedPlaceCandidates(input.tripState?.savedPlacesByCity)
  const retrievalPlaces = getPlacesFromTripState(input.tripState)
  let planPlaces: PlaceCandidate[] | undefined
  let retrievalUsed = false

  if (savedPlaces.length > 0) {
    planPlaces = mergePlaceCandidates(savedPlaces, retrievalPlaces)
    retrievalUsed = true
  } else if (retrievalPlaces && retrievalPlaces.length > 0) {
    planPlaces = retrievalPlaces
    retrievalUsed = true
  } else {
    const destinationKey = normalizeDestination(input.destination)
    const fixtures = fixtureData[destinationKey as keyof typeof fixtureData]
    if (!fixtures || fixtures.length === 0) {
      return {
        status: 404,
        body: {
          error: {
            code: 'fixtures_not_found',
            message: `No grounded fixtures found for destination "${input.destination}".`,
          },
        },
      }
    }

    planPlaces = fixtures.map(mapFixtureToPlaceCandidate)
  }

  const rankedPlaces = rankPlacesByPreferences({
    places: planPlaces,
    preferencesText: effectivePreferencesText,
  })

  const result: PlanTripResult = buildPlanTripResult({
    days: input.days,
    places: rankedPlaces,
  })

  const warnings = result.warnings ? [...result.warnings] : []
  if (!retrievalUsed) {
    warnings.push(
      'Nao ha evidencias retrieval recentes; usando fixtures padrao para montar o roteiro.',
    )
  }

  return {
    status: 200,
    body: {
      ...result,
      warnings: warnings.length > 0 ? warnings : undefined,
      effectivePreferencesText,
    },
  }
}

function parsePlanTripInput(value: unknown): PlanTripInput | null {
  if (!isRecord(value)) {
    return null
  }

  const { origin, destination, days, preferencesText, tripState } = value

  if (typeof origin !== 'string' || origin.trim() === '') {
    return null
  }

  if (typeof destination !== 'string' || destination.trim() === '') {
    return null
  }

  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1) {
    return null
  }

  if (
    preferencesText !== undefined &&
    typeof preferencesText !== 'string'
  ) {
    return null
  }

  if (tripState !== undefined && !isRecord(tripState)) {
    return null
  }

  return {
    origin: origin.trim(),
    destination: destination.trim(),
    days,
    preferencesText: preferencesText?.trim() || undefined,
    tripState: tripState as TripState | undefined,
  }
}

function getPlacesFromTripState(tripState?: TripState): PlaceCandidate[] | undefined {
  if (!tripState) {
    return undefined
  }

  const suggestions = tripState.conversationMeta?.lastSuggestions
  if (!suggestions || suggestions.length === 0) {
    return undefined
  }

  return suggestions.map(mapGroundedSuggestionToPlaceCandidate)
}

function mapGroundedSuggestionToPlaceCandidate(
  suggestion: GroundedSuggestionItem,
): PlaceCandidate {
  return {
    name: suggestion.title,
    location: buildLocationLabel(suggestion),
    source: suggestion.source,
    confidence: clampConfidence(suggestion.score),
    id: suggestion.docId ?? suggestion.chunkId,
  }
}

function mapFixtureToPlaceCandidate(fixture: FixturePlace): PlaceCandidate {
  return {
    name: fixture.name,
    location: fixture.location,
    source: fixture.source,
    confidence: clampConfidence(fixture.confidence),
  }
}

function buildLocationLabel(suggestion: GroundedSuggestionItem): string {
  const parts: string[] = []
  if (suggestion.region) {
    parts.push(suggestion.region)
  }
  if (suggestion.city) {
    parts.push(suggestion.city)
  }

  if (parts.length === 0) {
    return 'Recife'
  }

  return parts.join(', ')
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return 0
  }

  if (value < 0) {
    return 0
  }

  if (value > 1) {
    return 1
  }

  return value
}

function mergePlaceCandidates(
  primary: PlaceCandidate[],
  fallback?: PlaceCandidate[],
): PlaceCandidate[] {
  if (!fallback || fallback.length === 0) {
    return primary
  }

  const seenIds = new Set<string>()
  primary.forEach((candidate) => {
    seenIds.add(candidate.id ?? `${candidate.name}:${candidate.location}`)
  })

  const merged = [...primary]
  for (const candidate of fallback) {
    const identifier = candidate.id ?? `${candidate.name}:${candidate.location}`
    if (seenIds.has(identifier)) {
      continue
    }

    seenIds.add(identifier)
    merged.push(candidate)
  }

  return merged
}

function getSavedPlaceCandidates(
  savedPlaces?: TripState['savedPlacesByCity'],
): PlaceCandidate[] {
  if (!savedPlaces || savedPlaces.length === 0) {
    return []
  }

  const candidates: PlaceCandidate[] = []
  const seenIds = new Set<string>()

  for (const entry of savedPlaces) {
    if (!entry.city || entry.places.length === 0) {
      continue
    }

    for (const place of entry.places) {
      const name = place.placeName?.trim()
      if (!name) {
        continue
      }

      const baseId = `saved:${entry.city.toLowerCase()}:${name.toLowerCase()}`
      if (seenIds.has(baseId)) {
        continue
      }

      seenIds.add(baseId)

      candidates.push({
        name,
        location: entry.city,
        source: place.source === 'retrieval' ? 'saved:retrieval' : 'saved:user',
        confidence: place.source === 'retrieval' ? 0.9 : 0.95,
        id: baseId,
      })
    }
  }

  return candidates
}

function normalizeDestination(destination: string): string {
  return destination.trim().toLowerCase()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

type RankPlacesByPreferencesInput = {
  places: PlaceCandidate[]
  preferencesText?: string
}

function buildPlanTripResult(input: {
  days: number
  places: PlaceCandidate[]
}): PlanTripResult {
  if (input.places.length === 0) {
    return {
      days: [],
      warnings: ['No grounded places available for planning.'],
    }
  }

  const dayCount = Math.max(1, Math.min(input.days, input.places.length))
  const days = createEmptyDays(dayCount)

  input.places.forEach((place, index) => {
    days[index % dayCount].items.push(place)
  })

  const warnings =
    input.places.length < input.days
      ? ['Not enough grounded places to fill all requested days.']
      : undefined

  return {
    days,
    warnings,
  }
}

function createEmptyDays(dayCount: number): DayPlan[] {
  return Array.from({ length: dayCount }, (_, index) => ({
    day: index + 1,
    items: [],
  }))
}

function rankPlacesByPreferences(
  input: RankPlacesByPreferencesInput,
): PlaceCandidate[] {
  if (!input.preferencesText) {
    return input.places
  }

  const tokens = tokenizePreferences(input.preferencesText)
  if (tokens.length === 0) {
    return input.places
  }

  const withScore = input.places.map((place, index) => {
    const haystack = `${place.name} ${place.location}`.toLowerCase()
    const matched = tokens.filter((token) => tokenMatches(haystack, token)).length

    return {
      place,
      index,
      matched,
    }
  })

  const hasAnyMatch = withScore.some((entry) => entry.matched > 0)
  if (!hasAnyMatch) {
    return input.places
  }

  return [...withScore]
    .sort((a, b) => {
      if (a.matched !== b.matched) {
        return b.matched - a.matched
      }

      if (a.place.confidence !== b.place.confidence) {
        return b.place.confidence - a.place.confidence
      }

      return a.index - b.index
    })
    .map((entry) => entry.place)
}

function tokenizePreferences(preferencesText: string): string[] {
  return preferencesText
    .toLowerCase()
    .split(/[^a-z0-9\u00c0-\u024f]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
}

function tokenMatches(searchable: string, token: string): boolean {
  if (searchable.includes(token)) {
    return true
  }

  if (token.length > 3 && token.endsWith('s')) {
    const singular = token.slice(0, -1)
    if (searchable.includes(singular)) {
      return true
    }
  }

  return false
}
