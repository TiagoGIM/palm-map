import { placeFixturesByDestination } from '../../packages/domain-retrieval/fixtures'
import { resolveEffectivePreferencesText } from '../../packages/domain-memory'
import { buildPlanTripResult, rankPlacesByPreferences } from '../../packages/domain-trip'
import type { PlanTripInput, PlanTripResult } from '../../packages/shared-types'

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

export function handlePlanTrip(requestBody: unknown): PlanTripHttpResponse {
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

  const destinationKey = normalizeDestination(input.destination)
  const places = placeFixturesByDestination[destinationKey]

  if (!places || places.length === 0) {
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

  const rankedPlaces = rankPlacesByPreferences({
    places,
    preferencesText: effectivePreferencesText,
  })

  const result: PlanTripResult = buildPlanTripResult({
    days: input.days,
    places: rankedPlaces,
  })

  return {
    status: 200,
    body: {
      ...result,
      effectivePreferencesText,
    },
  }
}

function parsePlanTripInput(value: unknown): PlanTripInput | null {
  if (!isRecord(value)) {
    return null
  }

  const { origin, destination, days, preferencesText } = value

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

  return {
    origin: origin.trim(),
    destination: destination.trim(),
    days,
    preferencesText: preferencesText?.trim() || undefined,
  }
}

function normalizeDestination(destination: string): keyof typeof placeFixturesByDestination {
  return destination.trim().toLowerCase() as keyof typeof placeFixturesByDestination
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
