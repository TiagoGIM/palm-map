const STORAGE_KEY = 'palm_map_session_token'
let memoryToken: string | null = null

function readStorage(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored || null
  } catch {
    return null
  }
}

function writeStorage(value: string | null) {
  try {
    if (value === null) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, value)
    }
  } catch {
    memoryToken = value
  }
}

export function getSessionToken(): string | null {
  const stored = readStorage()
  return stored ?? memoryToken
}

export function setSessionToken(value: string): string {
  writeStorage(value)
  memoryToken = value
  return value
}

export function clearSessionToken() {
  writeStorage(null)
  memoryToken = null
}

export function getAuthHeaders(token?: string | null): Record<string, string> {
  const effectiveToken = token ?? getSessionToken()
  if (!effectiveToken) {
    throw new Error('Session token missing — enter it through the token gate.')
  }
  return {
    'X-Palm-Session-Token': effectiveToken,
  }
}
