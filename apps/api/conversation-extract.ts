import type { TripState } from '../../packages/shared-types'
import {
  extractStructuredWithLlm,
  type LlmStructuredExtraction,
} from './conversation-llm-adapter'
import { normalizeCity } from './conversation-city-utils'
import { normalizeGeographicMention } from './conversation-location-utils'
import {
  type ConversationUpdateRuntimeEnv,
  type ExtractedSavedPlaceAdd,
  type ExtractedSavedPlaceRemove,
  type ExtractedStopMention,
  type ExtractedSuggestionSaveReference,
  type ExtractedUpdate,
  SUGGESTION_STALE_WINDOW_MS,
} from './conversation-types'
import {
  isLowConfidence,
  logExtractionMode,
  parseMinConfidence,
} from './conversation-logging'

export async function extractFromMessage(params: {
  message: string
  tripState: TripState
  env: ConversationUpdateRuntimeEnv
}): Promise<ExtractedUpdate> {
  const llmResult = await extractStructuredWithLlm({
    message: params.message,
    tripState: params.tripState,
    env: params.env,
  })
  const minConfidence = parseMinConfidence(params.env.CONVERSATION_LLM_MIN_CONFIDENCE)

  if (!llmResult.ok) {
    logExtractionMode({
      env: params.env,
      event:
        llmResult.reason === 'llm_schema_validation_failed'
          ? 'validation_failed'
          : 'fallback_used',
      reason: llmResult.reason,
    })
    return extractHeuristicFromMessage(params.message, params.tripState)
  }

  if (isLowConfidence(llmResult.extraction.confidence, minConfidence)) {
    logExtractionMode({
      env: params.env,
      event: 'fallback_used',
      reason: 'low_confidence',
    })
    return extractHeuristicFromMessage(params.message, params.tripState)
  }

  logExtractionMode({ env: params.env, event: 'llm_used' })

  const llmMapped = mapLlmExtractionToUpdate(llmResult.extraction)
  return augmentSavedPlacesFromMessage(llmMapped, params.message, params.tripState)
}

function extractHeuristicFromMessage(
  message: string,
  currentState: TripState,
): ExtractedUpdate {
  const lower = message.toLowerCase()
  const hasSavedPlaceMutationVerb =
    /\b(salvar|salva|guardar|guarda|adiciona|adicionar|incluir|inclui|remover|remove|tirar|tira|excluir|exclui|apagar|apaga)\b/i.test(
      message,
    )
  const hasSavedPlaceListVerb = /\b(lista|listar|mostra|mostrar|quais)\b/i.test(message)
  const hasSavedPlaceListTarget = /\b(lugares|locais|pontos)\b/i.test(message)
  const isSavedPlaceMessage =
    hasSavedPlaceMutationVerb || (hasSavedPlaceListVerb && hasSavedPlaceListTarget)
  const fullRoute = isSavedPlaceMessage
    ? undefined
    : message.match(
        /\bde\s+([a-zà-ÿ\s/.-]+?)\s+(?:para|pra|até|ate|a)\s+([a-zà-ÿ\s/.-]+?)(?=\s+\b(?:por|em|com|no|na|vou|quero|pretendo|passar|ficar|seguir)\b|[,.!?]|$)/i,
      )
  const originOnly = isSavedPlaceMessage
    ? undefined
    : message.match(
        /\b(?:saindo de|partindo de|de)\s+([a-zà-ÿ\s/.-]+?)(?=\s+\b(?:e|depois|para|pra|até|ate|a|vou|quero|pretendo|passar|ficar|seguir)\b|[,.!?]|$)/i,
      )
  const destinationOnly = isSavedPlaceMessage
    ? undefined
    : message.match(
        /\b(?:para|pra|até|ate)\s+([a-zà-ÿ\s/.-]+?)(?=\s+\b(?:por|em|com|no|na|e|vou|quero|pretendo|passar|ficar|seguir)\b|[,.!?]|$)/i,
      )

  const likes = extractPreferenceItems(
    message,
    /\b(?:gosto de|curto|prefiro)\s+([^.!?]+)/gi,
  )
  const dislikes = extractPreferenceItems(
    message,
    /\b(?:nao gosto de|não gosto de|nao curto|não curto|evito)\s+([^.!?]+)/gi,
  )

  const stops = extractStops(message)

  const originCandidate = fullRoute?.[1] ?? originOnly?.[1]
  const destinationCandidate = fullRoute?.[2] ?? destinationOnly?.[1]

  const base: ExtractedUpdate = {
    origin: originCandidate
      ? normalizeGeographicMention(originCandidate)
      : undefined,
    destination: destinationCandidate
      ? normalizeGeographicMention(destinationCandidate)
      : undefined,
    daysTotal: extractDaysTotal(lower),
    stops,
    likes,
    dislikes,
    pace: extractPace(lower),
    budget: extractBudget(lower),
    savedPlaceAdds: [],
    savedPlaceRemoves: [],
    savedPlaceListIntent: false,
    suggestionIntent: false,
  }

  return augmentSavedPlacesFromMessage(base, message, currentState)
}

function mapLlmExtractionToUpdate(llm: LlmStructuredExtraction): ExtractedUpdate {
  return {
    origin: llm.origin ? normalizeGeographicMention(llm.origin) : undefined,
    destination: llm.destination
      ? normalizeGeographicMention(llm.destination)
      : undefined,
    daysTotal: llm.daysTotal,
    stops: llm.stops
      .map((stop): ExtractedStopMention | null => {
        const normalizedCity = normalizeGeographicMention(stop.city)
        if (!normalizedCity) {
          return null
        }

        const stopMention: ExtractedStopMention = {
          city: normalizedCity,
          strongAppend: true,
        }

        if (typeof stop.stayDays === 'number') {
          stopMention.stayDays = stop.stayDays
        }

        return stopMention
      })
      .filter((stop): stop is ExtractedStopMention => stop !== null),
    likes: llm.likes,
    dislikes: llm.dislikes,
    pace: llm.pace,
    budget: llm.budget,
    llmNextQuestion: llm.nextQuestion,
    llmPossibleMissingField: llm.possibleMissingField,
    llmConfidence: llm.confidence,
    savedPlaceAdds: [],
    savedPlaceRemoves: [],
    savedPlaceListIntent: false,
    suggestionIntent: false,
  }
}

function augmentSavedPlacesFromMessage(
  extracted: ExtractedUpdate,
  message: string,
  currentState: TripState,
): ExtractedUpdate {
  const suggestionIntent = extractSuggestionIntent(message)
  const addIntent = extractSavedPlaceAddIntent(message, currentState, extracted)
  const removeIntent = extractSavedPlaceRemoveIntent(message, currentState, extracted)
  const listIntent = extractSavedPlacesListIntent(message, currentState)

  return {
    ...extracted,
    savedPlaceAdds: addIntent.adds,
    savedPlaceRemoves: removeIntent.removes,
    savedPlaceSaveReference: addIntent.saveReference,
    savedPlaceNeedsCity: addIntent.needsCity || removeIntent.needsCity,
    savedPlaceNeedsPlaceName: addIntent.needsPlaceName || removeIntent.needsPlaceName,
    savedPlaceNeedsSuggestionRefresh: addIntent.needsSuggestionRefresh,
    savedPlaceListIntent: listIntent.listRequested,
    savedPlaceListCity: listIntent.listCity,
    suggestionIntent: suggestionIntent.triggered,
    suggestionQuery: suggestionIntent.query,
  }
}

export function extractSuggestionIntent(message: string): {
  triggered: boolean
  query?: string
} {
  const normalized = message.toLowerCase()
  if (
    /\b(salvar|salva|guardar|guarda|adiciona|adicionar|incluir|inclui|remover|remove|tirar|tira|excluir|exclui|apagar|apaga|lista|listar|mostra|mostrar)\b/i.test(
      normalized,
    )
  ) {
    return { triggered: false }
  }

  const triggered =
    /\b(sugere|sugest(ao|ão|oes|ões)|visitar|fazer|comer)\b/i.test(normalized) ||
    /\bo que vale\b/i.test(normalized) ||
    /\bop(c|ç)(ao|oes|ões)\b/i.test(normalized)

  if (!triggered) {
    return { triggered: false }
  }

  return { triggered: true, query: message.trim() }
}

function extractSavedPlaceAddIntent(
  message: string,
  currentState: TripState,
  extracted: ExtractedUpdate,
): {
  adds: ExtractedSavedPlaceAdd[]
  saveReference?: ExtractedSuggestionSaveReference
  needsCity?: boolean
  needsPlaceName?: boolean
  needsSuggestionRefresh?: boolean
} {
  if (!/\b(salvar|salva|guardar|guarda|adiciona|adicionar|incluir|inclui)\b/i.test(message)) {
    return { adds: [] }
  }

  const suggestionSaveRef = extractSavedSuggestionReference(message)
  if (suggestionSaveRef) {
    const suggestionSaved = tryBuildSavedPlaceFromSuggestions({
      currentState,
      suggestionReference: suggestionSaveRef,
    })
    if (suggestionSaved.kind === 'resolved') {
      return {
        adds: [
          {
            city: suggestionSaved.city,
            placeName: suggestionSaved.placeName,
            note: suggestionSaved.note,
            source: 'retrieval',
          },
        ],
        saveReference: suggestionSaveRef,
      }
    }

    if (suggestionSaved.kind === 'stale') {
      return { adds: [], saveReference: suggestionSaveRef, needsSuggestionRefresh: true }
    }

    return { adds: [], saveReference: suggestionSaveRef, needsPlaceName: true }
  }

  const normalizedMessage = message.replace(/\s+/g, ' ').trim()
  const explicitCityMatch = normalizedMessage.match(
    /\b(?:em|no|na)\s+([a-zà-ÿ\s/.-]+)$/i,
  )
  const explicitCityCandidate = explicitCityMatch?.[1]
    ? normalizeCity(explicitCityMatch[1])
    : undefined
  const explicitCity = isGenericContainerWord(explicitCityCandidate)
    ? undefined
    : explicitCityCandidate

  const rawPlaceMatch = normalizedMessage.match(
    /\b(?:salvar|salva|guardar|guarda|adiciona|adicionar|inclui|incluir)\s+(?:o|a|um|uma)?\s*(.+?)(?=\s+\b(?:em|no|na)\b|\s+\bno roteiro\b|$)/i,
  )
  const rawPlace = rawPlaceMatch?.[1]?.trim()
  const placeName = normalizePlaceName(rawPlace)
  const isPronounPlace = isContextualPlacePronoun(rawPlace ?? '')

  const resolvedCity =
    explicitCity ?? resolveCurrentFocusCity(currentState, extracted)

  if (!resolvedCity) {
    return { adds: [], needsCity: true }
  }

  if (!placeName || isPronounPlace) {
    return { adds: [], needsPlaceName: true }
  }

  return { adds: [{ city: resolvedCity, placeName, source: 'user' }] }
}

function extractSavedSuggestionReference(
  message: string,
): ExtractedSuggestionSaveReference | undefined {
  const normalized = message.toLowerCase()
  if (
    !/\b(salvar|salva|guardar|guarda|adiciona|adicionar|incluir|inclui)\b/i.test(message) ||
    !/\b(opcao|opção)\b/i.test(message)
  ) {
    return undefined
  }

  if (/\b(primeira|1a|1ª|1)\s+op(c|ç)ao\b/i.test(normalized)) {
    return { ordinalIndex: 0 }
  }
  if (/\b(segunda|2a|2ª|2)\s+op(c|ç)ao\b/i.test(normalized)) {
    return { ordinalIndex: 1 }
  }
  if (/\b(terceira|3a|3ª|3)\s+op(c|ç)ao\b/i.test(normalized)) {
    return { ordinalIndex: 2 }
  }

  const numeric = normalized.match(/\bop(c|ç)ao\s+(\d+)\b/i)
  if (numeric?.[2]) {
    const parsed = Number(numeric[2])
    if (Number.isInteger(parsed) && parsed >= 1) {
      return { ordinalIndex: parsed - 1 }
    }
  }

  return undefined
}

function tryBuildSavedPlaceFromSuggestions(params: {
  currentState: TripState
  suggestionReference: ExtractedSuggestionSaveReference
}):
  | { kind: 'resolved'; city: string; placeName: string; note?: string }
  | { kind: 'missing' }
  | { kind: 'stale' } {
  const meta = params.currentState.conversationMeta
  const suggestions = meta?.lastSuggestions
  if (!suggestions || suggestions.length === 0) {
    return { kind: 'missing' }
  }

  if (isSuggestionCacheStale(meta?.lastSuggestionsAt)) {
    return { kind: 'stale' }
  }

  const selected = suggestions[params.suggestionReference.ordinalIndex]
  if (!selected) {
    return { kind: 'missing' }
  }

  return {
    kind: 'resolved',
    city: selected.city,
    placeName: selected.title,
    note: `${selected.category} - ${selected.region}`,
  }
}

function isSuggestionCacheStale(lastSuggestionsAt: string | undefined): boolean {
  if (!lastSuggestionsAt) {
    return true
  }

  const parsed = Date.parse(lastSuggestionsAt)
  if (!Number.isFinite(parsed)) {
    return true
  }

  return Date.now() - parsed > SUGGESTION_STALE_WINDOW_MS
}

function extractSavedPlaceRemoveIntent(
  message: string,
  currentState: TripState,
  extracted: ExtractedUpdate,
): {
  removes: ExtractedSavedPlaceRemove[]
  needsCity?: boolean
  needsPlaceName?: boolean
} {
  if (!/\b(remover|remove|tirar|tira|excluir|exclui|apagar|apaga)\b/i.test(message)) {
    return { removes: [] }
  }

  const normalizedMessage = message.replace(/\s+/g, ' ').trim()
  const explicitCityMatch = normalizedMessage.match(
    /\b(?:em|no|na)\s+([a-zà-ÿ\s/.-]+)$/i,
  )
  const explicitCityCandidate = explicitCityMatch?.[1]
    ? normalizeCity(explicitCityMatch[1])
    : undefined
  const explicitCity = isGenericContainerWord(explicitCityCandidate)
    ? undefined
    : explicitCityCandidate

  const rawPlaceMatch = normalizedMessage.match(
    /\b(?:remover|remove|tirar|tira|excluir|exclui|apagar|apaga)\s+(?:o|a|um|uma)?\s*(.+?)(?=\s+\b(?:em|no|na)\b|\s+\bda\s+minha\s+lista\b|\s+\bdo\s+roteiro\b|$)/i,
  )
  const rawPlace = rawPlaceMatch?.[1]?.trim()
  const placeName = normalizePlaceName(rawPlace)
  const isPronounPlace = isContextualPlacePronoun(rawPlace ?? '')

  const resolvedCity =
    explicitCity ?? resolveCurrentFocusCity(currentState, extracted)

  if (!resolvedCity) {
    return { removes: [], needsCity: true }
  }

  if (!placeName || isPronounPlace) {
    return { removes: [], needsPlaceName: true }
  }

  return { removes: [{ city: resolvedCity, placeName }] }
}

function extractSavedPlacesListIntent(
  message: string,
  currentState: TripState,
): { listRequested: boolean; listCity?: string } {
  if (!/\b(lista|listar|mostra|mostrar|quais)\b/i.test(message)) {
    return { listRequested: false }
  }

  if (!/\b(lugares|locais|pontos|salvei|salvos)\b/i.test(message)) {
    return { listRequested: false }
  }

  const explicitCity = message.match(/\b(?:em|no|na)\s+([a-zà-ÿ\s/.-]+)$/i)?.[1]
  if (explicitCity) {
    return { listRequested: true, listCity: normalizeCity(explicitCity) }
  }

  const focusCity = currentState.conversationMeta?.currentFocusCity
  return { listRequested: true, listCity: focusCity }
}

function extractStops(message: string): ExtractedStopMention[] {
  type RawStopMention = ExtractedStopMention & { index: number }

  const mentions: RawStopMention[] = []
  const routePatterns = [
    /\bpass(?:ar|ando)\s+por\s+([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+){0,2}?)(?=\s+(?:e\b|depois\b|para\b|pra\b|até\b|ate\b|no\b|na\b)|[,.!?]|$)/gi,
    /\bpar(?:ar|ando)\s+em\s+([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+){0,2}?)(?=\s+(?:e\b|depois\b|para\b|pra\b|até\b|ate\b|no\b|na\b)|[,.!?]|$)/gi,
    /\b(?:adiciona|adicione|adicionar|inclui|inclua|incluir)\s+([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+){0,2})\s+(?:ao|a|no)\s+roteiro\b/gi,
  ]

  routePatterns.forEach((pattern) => {
    for (const match of message.matchAll(pattern)) {
      const rawCity = match[1] ?? ''
      const city = rawCity ? normalizeGeographicMention(rawCity) : undefined
      if (!city || /\d/.test(city)) {
        continue
      }
      mentions.push({
        city,
        strongAppend: true,
        index: match.index ?? Number.MAX_SAFE_INTEGER,
      })
    }
  })

  const stayPatterns = [
    /\b(?:fic(?:ar|ando)|pass(?:ar|ando))\s+(\d+)\s*dias?\s+em\s+([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+){0,2}?)(?=\s+(?:e\b|no\b|na\b|para\b|pra\b|até\b|ate\b)|[,.!?]|$)/gi,
    /\b(\d+)\s*dias?\s+em\s+([a-zà-ÿ]+(?:\s+[a-zà-ÿ]+){0,2}?)(?=\s+(?:e\b|no\b|na\b|para\b|pra\b|até\b|ate\b)|[,.!?]|$)/gi,
  ]

  stayPatterns.forEach((pattern) => {
    for (const match of message.matchAll(pattern)) {
      const stayDays = Number(match[1])
      const rawCity = match[2] ?? ''
      const city = rawCity ? normalizeGeographicMention(rawCity) : undefined

      if (!city || !Number.isInteger(stayDays) || stayDays < 1) {
        continue
      }

      mentions.push({
        city,
        stayDays,
        strongAppend: true,
        index: match.index ?? Number.MAX_SAFE_INTEGER,
      })
    }
  })

  mentions.sort((a, b) => a.index - b.index)

  const mergedByCity = new Map<string, ExtractedStopMention>()
  mentions.forEach((mention) => {
    const key = mention.city.toLowerCase()
    const existing = mergedByCity.get(key)

    if (!existing) {
      mergedByCity.set(key, {
        city: mention.city,
        stayDays: mention.stayDays,
        deltaStayDays: mention.deltaStayDays,
        strongAppend: mention.strongAppend,
      })
      return
    }

    mergedByCity.set(key, {
      ...existing,
      stayDays: mention.stayDays ?? existing.stayDays,
      deltaStayDays: mention.deltaStayDays ?? existing.deltaStayDays,
      strongAppend: existing.strongAppend || mention.strongAppend,
    })
  })

  return [...mergedByCity.values()]
}

export function extractDaysTotal(lowerMessage: string): number | undefined {
  const patterns = [
    /\b(?:por|durante)\s+(\d+)\s*dias?\b/i,
    /\bem\s+(\d+)\s*dias?\b/i,
    /\b(?:vou\s+passar|passarei|serao|serão|sera|será|ficarei)\s+(\d+)\s*dias?\b/i,
    /\b(?:viagem|roteiro)\s+(?:de\s+)?(\d+)\s*dias?\b/i,
    /\bquero\s+(\d+)\s*dias?\b/i,
    /\b(\d+)\s*dias?\s+de\s+viagem\b/i,
  ]

  for (const pattern of patterns) {
    const match = lowerMessage.match(pattern)
    if (match?.[1]) {
      return Number(match[1])
    }
  }

  return undefined
}

export function extractContextualDaysAnswer(message: string): number | undefined {
  const patterns = [
    /\b(?:vou\s+passar|passarei|serao|serão|sera|será|ficarei|quero|planejo)\s+(\d+)\s*dias?\b/i,
    /\b(\d+)\s*dias?\b/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) {
      const days = Number(match[1])
      if (Number.isInteger(days) && days > 0) {
        return days
      }
    }
  }

  return undefined
}

export function extractShortPlaceAnswer(message: string): string | undefined {
  const compact = message.replace(/\s+/g, ' ').trim()
  if (!compact || compact.length > 64) {
    return undefined
  }

  if (/\d/.test(compact)) {
    return undefined
  }

  if (/\b(quero|viajar|passar|parar|ficar|gosto|prefiro|evito|dias?)\b/i.test(compact)) {
    return undefined
  }

  const words = compact.split(' ').filter(Boolean)
  if (words.length > 4) {
    return undefined
  }

  const normalized = normalizeCity(compact)
  return normalized || undefined
}

function extractPreferenceItems(message: string, pattern: RegExp): string[] {
  const collected: string[] = []

  for (const match of message.matchAll(pattern)) {
    const phrase = (match[1] ?? '').trim()
    if (!phrase) {
      continue
    }

    phrase
      .split(/,| e /i)
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length >= 3)
      .filter((item) => !/^(nao|não)\b/.test(item))
      .forEach((item) => {
        if (!collected.includes(item)) {
          collected.push(item)
        }
      })
  }

  return collected
}

function extractPace(lowerMessage: string): TripState['preferences']['pace'] {
  if (/\b(tranquil[a-z]*|devagar|sem pressa)\b/.test(lowerMessage)) {
    return 'slow'
  }
  if (/\b(corrid[a-z]*|rapid[a-z]*)\b/.test(lowerMessage)) {
    return 'fast'
  }
  if (/\b(moderad|equilibrad)\b/.test(lowerMessage)) {
    return 'moderate'
  }
  return undefined
}

function extractBudget(
  lowerMessage: string,
): TripState['preferences']['budget'] {
  if (/\b(econom[a-z]*|barat[a-z]*|baixo custo)\b/.test(lowerMessage)) {
    return 'low'
  }
  if (/\b(luxo|premium|alto padrao|alto padrão)\b/.test(lowerMessage)) {
    return 'high'
  }
  if (/\b(medi[oa]|intermediari[oa]|custo medio|custo médio)\b/.test(lowerMessage)) {
    return 'medium'
  }
  return undefined
}

export function normalizePlaceName(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const compact = value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^esse\s+lugar$/i, '')
    .replace(/^esse\s+local$/i, '')
    .replace(/^esse\s+ponto$/i, '')
    .replace(/[.,;:!?]+$/g, '')
    .trim()

  if (!compact) {
    return undefined
  }

  return compact
}

function isContextualPlacePronoun(value: string): boolean {
  return /\b(esse lugar|esse local|esse ponto|la|lá|ali)\b/i.test(value.trim())
}

function isGenericContainerWord(value: string | undefined): boolean {
  if (!value) {
    return false
  }
  return ['Roteiro', 'Viagem', 'Destino'].includes(value)
}

// Minimal focus resolution needed for saved place city extraction.
// Full resolveCurrentFocus (with reference type handling) lives in conversation-merge.
function resolveCurrentFocusCity(
  currentState: TripState,
  extracted: ExtractedUpdate,
): string | undefined {
  const metaFocusCity = currentState.conversationMeta?.currentFocusCity
  if (metaFocusCity) {
    return metaFocusCity
  }

  const latestExtractedStop = extracted.stops.at(-1)?.city
  if (latestExtractedStop) {
    return latestExtractedStop
  }

  const lastStop = currentState.stops.at(-1)?.city
  if (lastStop) {
    return lastStop
  }

  if (currentState.destination) {
    return currentState.destination
  }

  return undefined
}
