import { describe, it, expect } from 'vitest'
import { requireSessionToken, SESSION_TOKEN_HEADER } from '../session-token'

const corsHeaders = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, x-palm-session-token' }
const expectedToken = 'secret-value'

describe('requireSessionToken', () => {
  it('returns a 401 response when the header is missing', async () => {
    const request = new Request('https://example.com/conversation/update', {
      method: 'POST',
    })
    const response = requireSessionToken(request, corsHeaders, expectedToken)
    expect(response).not.toBeNull()
    expect(response).toBeInstanceOf(Response)
    expect(response?.status).toBe(401)
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: 'session_token_missing' },
    })
  })

  it('returns a 503 response when the environment token is not configured', async () => {
    const request = new Request('https://example.com/conversation/update', {
      method: 'POST',
      headers: {
        [SESSION_TOKEN_HEADER]: 'secret-value',
      },
    })
    const response = requireSessionToken(request, corsHeaders, undefined)
    expect(response).not.toBeNull()
    expect(response?.status).toBe(503)
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: 'session_token_unconfigured' },
    })
  })

  it('returns a 401 response when the header token does not match the expected token', async () => {
    const request = new Request('https://example.com/conversation/update', {
      method: 'POST',
      headers: {
        [SESSION_TOKEN_HEADER]: 'wrong-token',
      },
    })
    const response = requireSessionToken(request, corsHeaders, expectedToken)
    expect(response).not.toBeNull()
    expect(response?.status).toBe(401)
    await expect(response?.json()).resolves.toMatchObject({
      error: { code: 'session_token_invalid' },
    })
  })

  it('allows requests with a matching header token', () => {
    const request = new Request('https://example.com/conversation/update', {
      method: 'POST',
      headers: {
        [SESSION_TOKEN_HEADER]: expectedToken,
      },
    })
    const response = requireSessionToken(request, corsHeaders, expectedToken)
    expect(response).toBeNull()
  })
})
