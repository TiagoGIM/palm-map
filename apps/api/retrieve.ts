import type { RetrieveInput, RetrieveResult } from '../../packages/shared-types'
import { retrieveLocalRecifeV1 } from '../../packages/domain-retrieval/retrieve-local'

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

export function handleRetrieve(requestBody: unknown): RetrieveHttpResponse {
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

  return {
    status: 200,
    body: retrieveLocalRecifeV1(input),
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
