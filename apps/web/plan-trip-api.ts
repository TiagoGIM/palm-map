import type { PlanTripInput, PlanTripResult } from '../../packages/shared-types'

type PlanTripApiError = {
  error: {
    code: string
    message: string
  }
}

const ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim()

export async function requestPlanTrip(
  input: PlanTripInput,
): Promise<PlanTripResult> {
  const response = await fetch(resolvePlanTripUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = (await response.json()) as PlanTripApiError
    throw new Error(error.error.message)
  }

  return (await response.json()) as PlanTripResult
}

function resolvePlanTripUrl(): string {
  if (!ENV_API_BASE_URL) {
    return '/api/plan-trip'
  }

  const normalizedBase = ENV_API_BASE_URL.replace(/\/+$/, '')
  return `${normalizedBase}/plan-trip`
}
