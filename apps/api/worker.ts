import { handlePlanTrip } from './plan-trip'

type WorkerEnv = {
  APP_ENV?: string
  API_ALLOWED_ORIGIN?: string
  D1_BINDING_NAME?: string
  VECTORIZE_BINDING_NAME?: string
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const corsHeaders = {
      ...CORS_HEADERS,
      'access-control-allow-origin': env.API_ALLOWED_ORIGIN ?? '*',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      })
    }

    const url = new URL(request.url)
    const isPlanTripRoute =
      url.pathname === '/plan-trip' || url.pathname === '/api/plan-trip'

    if (!isPlanTripRoute || request.method !== 'POST') {
      return jsonResponse(
        {
          error: {
            code: 'not_found',
            message: 'Route not found.',
          },
        },
        404,
        corsHeaders,
      )
    }

    const requestBody = await parseJsonBody(request)
    if (requestBody === null) {
      return jsonResponse(
        {
          error: {
            code: 'invalid_request',
            message: 'Request body must be valid JSON.',
          },
        },
        400,
        corsHeaders,
      )
    }

    const response = handlePlanTrip(requestBody)
    return jsonResponse(response.body, response.status, corsHeaders)
  },
}

async function parseJsonBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json; charset=utf-8',
    },
  })
}
