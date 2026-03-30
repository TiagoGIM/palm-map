const ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim()

function normalizeBaseUrl(value: string): string {
  const trimmed = value.replace(/\/+$/, '')
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed
  }
  return `https://${trimmed}`
}

function isLocalWebEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

export function resolveApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (ENV_API_BASE_URL) {
    return `${normalizeBaseUrl(ENV_API_BASE_URL)}${normalizedPath}`
  }

  if (isLocalWebEnvironment()) {
    return `/api${normalizedPath}`
  }

  throw new Error(
    'VITE_API_BASE_URL nao configurado para ambiente publicado. Defina a URL publica da API no build do frontend.',
  )
}
