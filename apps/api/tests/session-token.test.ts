import { describe, it, expect } from 'vitest'
import { requireSessionToken, SESSION_TOKEN_HEADER } from '../session-token'

const corsHeaders = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-palm-session-token' }

describe('requireSessionToken', () => {
  it('returns a 401 response when the header is missing', () => {
    const request = new Request('https://example.com/conversation/update', {
      method: 'POST',
    })
    const response = requireSessionToken(request, corsHeaders)
    expect(response).not.toBeNull()
    expect(response).toBeInstanceOf(Response)
    expect(response?.status).toBe(401)
  })

  it('allows requests with the header', () => {
    const request = new Request('https://example.com/conversation/update', {
      method: 'POST',
      headers: {
        [SESSION_TOKEN_HEADER]: 'secret-value',
      },
    })
    const response = requireSessionToken(request, corsHeaders)
    expect(response).toBeNull()
  })
})
