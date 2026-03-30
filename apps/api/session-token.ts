export const SESSION_TOKEN_HEADER = 'x-palm-session-token'

export function requireSessionToken(
  request: Request,
  corsHeaders: Record<string, string>,
  expectedToken: string | undefined,
): Response | null {
  const token = request.headers.get(SESSION_TOKEN_HEADER)
  if (!token || !token.trim()) {
    return tokenErrorResponse(
      corsHeaders,
      401,
      'session_token_missing',
      `Missing ${SESSION_TOKEN_HEADER} header.`,
    )
  }

  if (!expectedToken || !expectedToken.trim()) {
    return tokenErrorResponse(
      corsHeaders,
      503,
      'session_token_unconfigured',
      'Session token secret is not configured in this environment.',
    )
  }

  if (token.trim() !== expectedToken.trim()) {
    return tokenErrorResponse(
      corsHeaders,
      401,
      'session_token_invalid',
      'Invalid session token.',
    )
  }

  return null
}

function tokenErrorResponse(
  corsHeaders: Record<string, string>,
  status: number,
  code: 'session_token_missing' | 'session_token_invalid' | 'session_token_unconfigured',
  message: string,
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
      },
    }),
    {
      status,
      headers: {
        ...corsHeaders,
        'content-type': 'application/json; charset=utf-8',
      },
    },
  )
}
