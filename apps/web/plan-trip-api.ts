import type { PlanTripInput, PlanTripResult } from '../../packages/shared-types'
import { getAuthHeaders } from './api/session-token'
import { resolveApiUrl } from './api/resolve-api-url'

type PlanTripApiError = {
  error: {
    code: string
    message: string
  }
}

export async function requestPlanTrip(
  input: PlanTripInput,
): Promise<PlanTripResult> {
  const response = await fetch(resolveApiUrl('/plan-trip'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = (await response.json()) as PlanTripApiError
    throw new Error(error.error.message)
  }

  return (await response.json()) as PlanTripResult
}
