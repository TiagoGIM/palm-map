export const SESSION_TOKEN_HEADER = 'x-palm-session-token'

export function requireSessionToken(
  request: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  const token = request.headers.get(SESSION_TOKEN_HEADER)
  if (!token || !token.trim()) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'session_token_missing',
          message: `Missing ${SESSION_TOKEN_HEADER} header.`,
        },
      }),
      {
        status: 401,
        headers: {
          ...corsHeaders,
          'content-type': 'application/json; charset=utf-8',
        },
      },
    )
  }
  return null
}
