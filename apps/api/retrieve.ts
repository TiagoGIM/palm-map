import type { RetrieveHit, RetrieveInput, RetrieveResult } from '../../packages/shared-types'
import type { D1Database } from '../../packages/domain-memory'
import {
  retrieveLocalRecifeV1,
  retrieveFromD1,
} from '../../packages/domain-retrieval/retrieve-local'

type ApiErrorBody = {
  error: {
    code: 'invalid_request'
    message: string
  }
}

type ApiSuccessResponse = {
  status: 200
  body: RetrieveResult
}

type ApiErrorResponse = {
  status: 400
  body: ApiErrorBody
}

export type RetrieveHttpResponse = ApiSuccessResponse | ApiErrorResponse

export async function handleRetrieve(
  requestBody: unknown,
  db?: D1Database,
): Promise<RetrieveHttpResponse> {
  const input = parseRetrieveInput(requestBody)

  if (!input) {
    return {
      status: 400,
      body: {
        error: {
          code: 'invalid_request',
          message: 'Request body must match RetrieveInput.',
        },
      },
    }
  }

  const localResult = retrieveLocalRecifeV1(input)

  if (!db) {
    return { status: 200, body: localResult }
  }

  const d1Result = await retrieveFromD1(db, input)
  const merged = mergeResults(localResult, d1Result, input.topK ?? 5)

  return { status: 200, body: merged }
}

/**
 * Merges local and D1 results: deduplicates by chunkId (local takes precedence),
 * re-sorts by score descending, and slices to topK.
 */
function mergeResults(
  local: RetrieveResult,
  d1: RetrieveResult,
  topK: number,
): RetrieveResult {
  const seen = new Set<string>()
  const combined: RetrieveHit[] = []

  for (const hit of local.results) {
    seen.add(hit.chunkId)
    combined.push(hit)
  }

  for (const hit of d1.results) {
    if (!seen.has(hit.chunkId)) {
      combined.push(hit)
    }
  }

  combined.sort((a, b) => b.score - a.score)

  const results = combined.slice(0, topK)

  return {
    query: local.query,
    city: local.city,
    topK,
    results,
    ...(results.length === 0
      ? { warning: local.warning ?? d1.warning }
      : {}),
  }
}

function parseRetrieveInput(payload: unknown): RetrieveInput | undefined {
  if (!isRecord(payload)) {
    return undefined
  }

  const query = typeof payload.query === 'string' ? payload.query.trim() : ''
  const city = typeof payload.city === 'string' ? payload.city.trim() : ''
  const topK = payload.topK

  if (!query || !city) {
    return undefined
  }

  if (topK !== undefined && (!Number.isFinite(topK) || typeof topK !== 'number')) {
    return undefined
  }

  return {
    query,
    city,
    topK,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
