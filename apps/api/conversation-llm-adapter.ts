import type { TripState } from '../../packages/shared-types'

export type ConversationLlmEnv = {
  CONVERSATION_LLM_ENABLED?: string
  CONVERSATION_LLM_API_KEY?: string
  CONVERSATION_LLM_BASE_URL?: string
  CONVERSATION_LLM_MODEL?: string
  CONVERSATION_LLM_TIMEOUT_MS?: string
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

  const baseUrl =
    params.env.CONVERSATION_LLM_BASE_URL?.trim() ??
    'https://api.openai.com/v1'
  const model = params.env.CONVERSATION_LLM_MODEL?.trim() ?? 'gpt-4.1-mini'
  const timeoutMs = parseTimeoutMs(params.env.CONVERSATION_LLM_TIMEOUT_MS)

  let responseBody: unknown

  try {
    responseBody = await callChatCompletions({
      baseUrl,
      apiKey,
      model,
      timeoutMs,
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

function parseTimeoutMs(raw?: string): number {
  const parsed = Number(raw ?? '')
  if (Number.isInteger(parsed) && parsed >= 500 && parsed <= 30_000) {
    return parsed
  }
  return 5_000
}

async function callChatCompletions(params: {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
  message: string
  tripState: TripState
}): Promise<unknown> {
  const endpoint = `${params.baseUrl.replace(/\/$/, '')}/chat/completions`
  const body = {
    model: params.model,
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'conversation_trip_extraction',
        strict: true,
        schema: EXTRACTION_JSON_SCHEMA,
      },
    },
    messages: [
      {
        role: 'system',
        content: buildSystemPrompt(),
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
    ],
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

function buildSystemPrompt(): string {
  return [
    'You extract structured travel-state updates.',
    'Return ONLY valid JSON that matches the provided schema.',
    'Do not invent cities, dates, stops, or durations.',
    'Use only explicit user information from the message.',
    'stops must include only intermediate cities, never origin or destination.',
    'If a field is unknown, omit it.',
    'If no likes/dislikes/stops were found, return empty arrays for them.',
    'possibleMissingField should indicate the next missing required field among origin, destination, daysTotal when applicable.',
    'confidence should reflect extraction confidence from 0 to 1.',
  ].join(' ')
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
  const likes = normalizeStringArray(value.likes)
  const dislikes = normalizeStringArray(value.dislikes)
  const stops = normalizeStops(value.stops)

  if (!likes || !dislikes || !stops) {
    return null
  }

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

  const compact = value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^praia\s+de\s+/i, '')
    .replace(/\s*\/\s*[a-z]{2}\b.*$/i, '')
    .replace(/\s*-\s*[a-z]{2}\b.*$/i, '')
    .replace(/\s+e\s+seguir.*$/i, '')
    .replace(/\s+e\s+depois.*$/i, '')
    .replace(/\s+no\s+caminho.*$/i, '')
    .replace(/[.,;:!?]+$/g, '')
    .trim()
  if (!compact) {
    return undefined
  }

  return compact
    .split(' ')
    .map((part, index) => {
      const lowerPart = part.toLowerCase()
      if (
        index > 0 &&
        ['de', 'da', 'do', 'das', 'dos', 'e'].includes(lowerPart)
      ) {
        return lowerPart
      }

      return lowerPart[0].toUpperCase() + lowerPart.slice(1)
    })
    .join(' ')
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
