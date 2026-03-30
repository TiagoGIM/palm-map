import { useCallback, useState } from 'react'
import {
  clearSessionToken,
  getSessionToken,
  setSessionToken,
} from '../api/session-token'

export function useSessionToken() {
  const [token, setTokenState] = useState<string | null>(() => getSessionToken())

  const saveToken = useCallback((value: string) => {
    setSessionToken(value)
    setTokenState(value)
  }, [])

  const resetToken = useCallback(() => {
    clearSessionToken()
    setTokenState(null)
  }, [])

  return {
    token,
    saveToken,
    clearToken: resetToken,
  }
}
