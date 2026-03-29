import type { TripState } from '../../packages/shared-types'
import { normalizeCity } from './conversation-city-utils'

export type ConversationLlmEnv = {
  CONVERSATION_LLM_ENABLED?: string
  CONVERSATION_LLM_API_KEY?: string
  CONVERSATION_LLM_BASE_URL?: string
  CONVERSATION_LLM_MODEL?: string
  CONVERSATION_LLM_TIMEOUT_MS?: string
  /** Cloudflare account ID. When set, overrides BASE_URL to Cloudflare Workers AI endpoint. */
  CONVERSATION_LLM_ACCOUNT_ID?: string
  /**
   * Response format mode:
   * - "json_schema" (default): OpenAI strict structured output — enforces schema server-side.
   * - "json_object": JSON free-form — compatible with Cloudflare Workers AI and other providers.
   *   Schema is described inside the system prompt instead.
   */
  CONVERSATION_LLM_RESPONSE_MODE?: 'json_schema' | 'json_object'
}

export type LlmStructuredStop = {
  city: string
  stayDays?: number
}

export type LlmStructuredExtraction = {
  origin?: string
  destination?: string
  daysTotal?: number
  stops: LlmStructuredStop[]
  likes: string[]
  dislikes: string[]
  pace?: TripState['preferences']['pace']
  budget?: TripState['preferences']['budget']
  possibleMissingField?: 'origin' | 'destination' | 'daysTotal'
  confidence?: number
  nextQuestion?: string
}

type LlmExtractionResult =
  | { ok: true; extraction: LlmStructuredExtraction }
  | { ok: false; reason: string }

const EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    origin: { type: 'string' },
    destination: { type: 'string' },
    daysTotal: { type: 'integer', minimum: 1 },
    stops: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          city: { type: 'string' },
          stayDays: { type: 'integer', minimum: 1 },
        },
        required: ['city'],
      },
    },
    likes: {
      type: 'array',
      items: { type: 'string' },
    },
    dislikes: {
      type: 'array',
      items: { type: 'string' },
    },
    pace: {
      type: 'string',
      enum: ['slow', 'moderate', 'fast'],
    },
    budget: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
    },
    possibleMissingField: {
      type: 'string',
      enum: ['origin', 'destination', 'daysTotal'],
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    nextQuestion: { type: 'string' },
  },
  required: ['stops', 'likes', 'dislikes'],
} as const

export async function extractStructuredWithLlm(params: {
  message: string
  tripState: TripState
  env: ConversationLlmEnv
}): Promise<LlmExtractionResult> {
  if (!isLlmEnabled(params.env)) {
    return { ok: false, reason: 'llm_disabled' }
  }

  const apiKey = params.env.CONVERSATION_LLM_API_KEY?.trim()
  if (!apiKey) {
    return { ok: false, reason: 'missing_api_key' }
  }

  const baseUrl = resolveBaseUrl(params.env)
  const model = params.env.CONVERSATION_LLM_MODEL?.trim() ?? 'gpt-4.1-mini'
  const timeoutMs = parseTimeoutMs(params.env.CONVERSATION_LLM_TIMEOUT_MS)
  const responseMode = params.env.CONVERSATION_LLM_RESPONSE_MODE ?? 'json_schema'

  let responseBody: unknown

  try {
    responseBody = await callChatCompletions({
      baseUrl,
      apiKey,
      model,
      timeoutMs,
      responseMode,
      message: params.message,
      tripState: params.tripState,
    })
  } catch (error) {
    return {
      ok: false,
      reason: `llm_request_failed:${stringifyError(error)}`,
    }
  }

  const parsed = parseLlmJsonPayload(responseBody)
  if (!parsed) {
    return { ok: false, reason: 'invalid_llm_json' }
  }

  const normalized = normalizeLlmExtraction(parsed)
  if (!normalized) {
    return { ok: false, reason: 'llm_schema_validation_failed' }
  }

  return {
    ok: true,
    extraction: normalized,
  }
}

function isLlmEnabled(env: ConversationLlmEnv): boolean {
  return (env.CONVERSATION_LLM_ENABLED ?? '').toLowerCase() === 'true'
}

function resolveBaseUrl(env: ConversationLlmEnv): string {
  const accountId = env.CONVERSATION_LLM_ACCOUNT_ID?.trim()
  if (accountId) {
    return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`
  }
  return env.CONVERSATION_LLM_BASE_URL?.trim() ?? 'https://api.openai.com/v1'
}

function parseTimeoutMs(raw?: string): number {
  const parsed = Number(raw ?? '')
  if (Number.isInteger(parsed) && parsed >= 500 && parsed <= 30_000) {
    return parsed
  }
  return 5_000
}

type ResponseMode = 'json_schema' | 'json_object'

async function callChatCompletions(params: {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  responseMode: ResponseMode
  message: string
  tripState: TripState
}): Promise<unknown> {
  const endpoint = `${params.baseUrl.replace(/\/$/, '')}/chat/completions`

  const messages = [
    {
      role: 'system',
      content: buildSystemPrompt(params.responseMode),
    },
    {
      role: 'user',
      content: JSON.stringify(
        {
          message: params.message,
          currentTripState: params.tripState,
        },
        null,
        2,
      ),
    },
  ]

  // Cloudflare Workers AI does not support response_format via the OpenAI-compatible endpoint.
  // In json_object mode, the schema is described in the system prompt instead.
  const body: Record<string, unknown> = { model: params.model, temperature: 0, messages }
  if (params.responseMode !== 'json_object') {
    body['response_format'] = {
      type: 'json_schema',
      json_schema: {
        name: 'conversation_trip_extraction',
        strict: true,
        schema: EXTRACTION_JSON_SCHEMA,
      },
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`status_${response.status}`)
    }

    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function buildSystemPrompt(responseMode: ResponseMode = 'json_schema'): string {
  const base = [
    'You extract structured travel-state updates from user messages in Portuguese or English.',
    'IMPORTANT: Your response must ALWAYS be a single valid JSON object, nothing else.',
    'Never write prose. Never explain. Never add any text outside the JSON.',
    'Do not invent cities, dates, stops, or durations.',
    'Use only explicit user information from the message.',
    'stops are intermediate cities visited before reaching the final destination (e.g. "passar N dias em X antes de chegar em Y" → stop=X, destination=Y).',
    'stops must never include origin or destination.',
    'If a field is unknown, omit it.',
    'If no likes/dislikes/stops were found, return empty arrays for them.',
    'possibleMissingField should indicate the next missing required field among origin, destination, daysTotal when applicable.',
    'confidence should reflect extraction confidence from 0 to 1.',
    'If currentTripState.conversationMeta.lastAskedField is set and the message is a short reply (city name, number, etc.), interpret it as the answer to that field.',
    'Pace mapping: "tranquilo/tranquila/calmo/devagar/lento" = "slow"; "moderado/normal" = "moderate"; "rapido/agitado/intenso" = "fast".',
    'Budget mapping: "economico/economica/barato/barata/low cost/budget" = "low"; "medio/moderado" = "medium"; "luxo/caro/cara/premium/high end" = "high".',
  ]

  if (responseMode === 'json_object') {
    base.push(
      'Your response must be a JSON object with these optional fields:',
      'origin (string), destination (string), daysTotal (integer >= 1),',
      'stops (array of {city: string, stayDays?: integer}),',
      'likes (string[]), dislikes (string[]),',
      'pace ("slow"|"moderate"|"fast"), budget ("low"|"medium"|"high"),',
      'possibleMissingField ("origin"|"destination"|"daysTotal"),',
      'confidence (number 0-1), nextQuestion (string).',
      'Required: stops, likes, dislikes (use empty arrays if none found).',
    )
  }

  return base.join(' ')
}

function parseLlmJsonPayload(value: unknown): unknown | null {
  if (!isRecord(value)) {
    return null
  }

  const choices = value.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    return null
  }

  const first = choices[0]
  if (!isRecord(first) || !isRecord(first.message)) {
    return null
  }

  const content = first.message.content
  if (typeof content === 'string') {
    return parseJson(content)
  }

  if (Array.isArray(content)) {
    const textPart = content.find(
      (item) => isRecord(item) && item.type === 'text' && typeof item.text === 'string',
    ) as { text?: string } | undefined

    if (textPart?.text) {
      return parseJson(textPart.text)
    }
  }

  return null
}

function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function normalizeLlmExtraction(value: unknown): LlmStructuredExtraction | null {
  if (!isRecord(value)) {
    return null
  }

  const origin = normalizeOptionalPlace(value.origin)
  const destination = normalizeOptionalPlace(value.destination)
  const daysTotal = normalizeOptionalPositiveInteger(value.daysTotal)
  const likes = normalizeStringArray(value.likes) ?? []
  const dislikes = normalizeStringArray(value.dislikes) ?? []
  const stops = normalizeStops(value.stops) ?? []

  const pace = normalizeEnum(value.pace, ['slow', 'moderate', 'fast'])
  const budget = normalizeEnum(value.budget, ['low', 'medium', 'high'])
  const possibleMissingField = normalizeEnum(
    value.possibleMissingField,
    ['origin', 'destination', 'daysTotal'],
  )
  const confidence = normalizeOptionalConfidence(value.confidence)
  const nextQuestion = normalizeOptionalText(value.nextQuestion)

  return {
    origin,
    destination,
    daysTotal,
    stops,
    likes,
    dislikes,
    pace,
    budget,
    possibleMissingField,
    confidence,
    nextQuestion,
  }
}

function normalizeStops(value: unknown): LlmStructuredStop[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const normalized: LlmStructuredStop[] = []
  const known = new Set<string>()

  value.forEach((item) => {
    if (!isRecord(item)) {
      return
    }

    const city = normalizeOptionalPlace(item.city)
    if (!city) {
      return
    }

    const cityKey = city.toLowerCase()
    if (known.has(cityKey)) {
      return
    }

    known.add(cityKey)
    normalized.push({
      city,
      stayDays: normalizeOptionalPositiveInteger(item.stayDays),
    })
  })

  return normalized
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const normalized: string[] = []
  value.forEach((item) => {
    if (typeof item !== 'string') {
      return
    }

    const cleaned = item.trim().toLowerCase()
    if (!cleaned) {
      return
    }

    if (!normalized.includes(cleaned)) {
      normalized.push(cleaned)
    }
  })

  return normalized
}

function normalizeOptionalPlace(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const result = normalizeCity(value)
  return result || undefined
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const compact = value.replace(/\s+/g, ' ').trim()
  return compact || undefined
}

function normalizeOptionalPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return undefined
  }

  return value
}

function normalizeOptionalConfidence(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  if (value < 0 || value > 1) {
    return undefined
  }

  return value
}

function normalizeEnum<const T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'unknown_error'
}
