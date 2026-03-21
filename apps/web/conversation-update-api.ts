import type {
  ConversationTripUpdateInput,
  ConversationTripUpdateResult,
} from '../../packages/shared-types'

type ConversationApiError = {
  error: {
    code: string
    message: string
  }
}

const ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim()

export async function requestConversationUpdate(
  input: ConversationTripUpdateInput,
): Promise<ConversationTripUpdateResult> {
  const response = await fetch(resolveConversationUpdateUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = (await response.json()) as ConversationApiError
    throw new Error(error.error.message)
  }

  return (await response.json()) as ConversationTripUpdateResult
}

function resolveConversationUpdateUrl(): string {
  if (!ENV_API_BASE_URL) {
    return '/api/conversation/update'
  }

  const normalizedBase = ENV_API_BASE_URL.replace(/\/+$/, '')
  return `${normalizedBase}/conversation/update`
}
