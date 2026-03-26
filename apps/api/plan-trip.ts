import type {
  PlanTripInput,
  PlanTripResult,
  PlaceCandidate,
  GroundedSuggestionItem,
  TripState,
} from '../../packages/shared-types/index.ts'

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

  const [
    domainRetrievalModule,
    domainMemoryModule,
    domainTripModule,
  ] = await Promise.all([
    import('../../packages/domain-retrieval/fixtures.ts'),
    import('../../packages/domain-memory/index.ts'),
    import('../../packages/domain-trip/index.ts'),
  ])

  const { placeFixturesByDestination } =
    domainRetrievalModule as typeof import('../../packages/domain-retrieval/fixtures.ts')
  const { resolveEffectivePreferencesText } =
    domainMemoryModule as typeof import('../../packages/domain-memory/index.ts')
  const { buildPlanTripResult, rankPlacesByPreferences } =
    domainTripModule as typeof import('../../packages/domain-trip/index.ts')

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
    const fixtures = placeFixturesByDestination[
      destinationKey as keyof typeof placeFixturesByDestination
    ]
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

    planPlaces = fixtures
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
