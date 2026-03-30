import type { PlanTripInput, PlanTripResult } from '../../packages/shared-types'
import { getAuthHeaders } from './api/session-token'

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

function resolvePlanTripUrl(): string {
  if (ENV_API_BASE_URL) {
    const normalizedBase = ENV_API_BASE_URL.replace(/\/+$/, '')
    return `${normalizedBase}/plan-trip`
  }

  if (isLocalWebEnvironment()) {
    return '/api/plan-trip'
  }

  throw new Error(
    'VITE_API_BASE_URL nao configurado para ambiente publicado. Defina a URL publica da API no build do frontend.',
  )
}

function isLocalWebEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1'
}
