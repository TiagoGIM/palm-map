import { handleConversationUpdate } from './conversation-update'
import { handleDatasetUpload } from './dataset-upload'
import { handlePlanTrip } from './plan-trip'
import { handleRetrieve } from './retrieve'
import type { D1Database } from '../../packages/domain-memory'
import { requireSessionToken } from './session-token'

type WorkerEnv = {
  APP_ENV?: string
  API_ALLOWED_ORIGIN?: string
  PALM_SESSION_TOKEN?: string
  VECTORIZE_BINDING_NAME?: string
  CONVERSATION_LLM_ENABLED?: string
  CONVERSATION_LLM_API_KEY?: string
  CONVERSATION_LLM_BASE_URL?: string
  CONVERSATION_LLM_MODEL?: string
  CONVERSATION_LLM_TIMEOUT_MS?: string
  CONVERSATION_LLM_DEBUG?: string
  CONVERSATION_LLM_MIN_CONFIDENCE?: string
  CONVERSATION_UPDATE_DEBUG?: string
  /** Real D1 database binding — present only when [[d1_databases]] is configured in wrangler.toml. */
  PALM_MAP_DB?: D1Database
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-palm-session-token',
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
    const isConversationUpdateRoute =
      url.pathname === '/conversation/update' ||
      url.pathname === '/api/conversation/update'
    const isRetrieveRoute =
      url.pathname === '/retrieve' || url.pathname === '/api/retrieve'
    const isDatasetUploadRoute =
      url.pathname === '/dataset/upload' || url.pathname === '/api/dataset/upload'

    if (
      request.method !== 'POST' ||
      (!isPlanTripRoute && !isConversationUpdateRoute && !isRetrieveRoute && !isDatasetUploadRoute)
    ) {
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

    const tokenResponse = requireSessionToken(
      request,
      corsHeaders,
      env.PALM_SESSION_TOKEN,
    )
    if (tokenResponse) {
      return tokenResponse
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

    const response = isConversationUpdateRoute
      ? await handleConversationUpdate(requestBody, env)
      : isDatasetUploadRoute
        ? await handleDatasetUpload(requestBody, env.PALM_MAP_DB)
        : isRetrieveRoute
          ? await handleRetrieve(requestBody, env.PALM_MAP_DB)
          : await handlePlanTrip(requestBody)

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
