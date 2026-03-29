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
    let message = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as ConversationApiError
      message = body.error?.message ?? message
    } catch { /* ignore parse failure — use generic HTTP status message */ }
    throw new Error(message)
  }

  return (await response.json()) as ConversationTripUpdateResult
}

function resolveConversationUpdateUrl(): string {
  if (ENV_API_BASE_URL) {
    const normalizedBase = ENV_API_BASE_URL.replace(/\/+$/, '')
    return `${normalizedBase}/conversation/update`
  }

  if (isLocalWebEnvironment()) {
    return '/api/conversation/update'
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
