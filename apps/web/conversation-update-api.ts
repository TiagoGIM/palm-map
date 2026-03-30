import type {
  ConversationTripUpdateInput,
  ConversationTripUpdateResult,
} from '../../packages/shared-types'
import { getAuthHeaders } from './api/session-token'
import { resolveApiUrl } from './api/resolve-api-url'

type ConversationApiError = {
  error: {
    code: string
    message: string
  }
}

export async function requestConversationUpdate(
  input: ConversationTripUpdateInput,
): Promise<ConversationTripUpdateResult> {
  const response = await fetch(resolveApiUrl('/conversation/update'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as ConversationApiError
      message = body.error?.message ?? message
    } catch { /* ignore parse failure — use generic HTTP status message */ }
    throw new Error(message)
  }

  return (await response.json()) as ConversationTripUpdateResult
}
