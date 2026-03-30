import type { CitySavedPlaces, ConversationAskField, ConversationFocusField, TripState } from '../../packages/shared-types'
import { normalizeCity } from './conversation-city-utils'
import {
  type ExtractedUpdate,
  type MissingField,
} from './conversation-types'
import { extractContextualDaysAnswer, extractShortPlaceAnswer } from './conversation-extract'

// Re-export ConversationAskField so consumers can import from here if needed
export type { ConversationAskField }

export function createBaseTripState(tripState?: TripState): TripState {
  return {
    ...tripState,
    stops: tripState?.stops ?? [],
    savedPlacesByCity: tripState?.savedPlacesByCity ?? [],
    preferences: {
      likes: tripState?.preferences?.likes ?? [],
      dislikes: tripState?.preferences?.dislikes ?? [],
      pace: tripState?.preferences?.pace,
      budget: tripState?.preferences?.budget,
    },
    conversationMeta: {
      lastAskedField: tripState?.conversationMeta?.lastAskedField,
      askedFieldsRecent: tripState?.conversationMeta?.askedFieldsRecent ?? [],
      lastResolvedField: tripState?.conversationMeta?.lastResolvedField,
      lastUserMessage:
        tripState?.conversationMeta?.lastUserMessage ??
        tripState?.conversationMeta?.lastUserTurn,
      lastUserTurn: tripState?.conversationMeta?.lastUserTurn,
      conversationStage: tripState?.conversationMeta?.conversationStage,
      confidenceByField: tripState?.conversationMeta?.confidenceByField,
      unresolvedFields: tripState?.conversationMeta?.unresolvedFields ?? [],
      currentFocusCity: tripState?.conversationMeta?.currentFocusCity,
      currentFocusField: tripState?.conversationMeta?.currentFocusField,
      lastSuggestions: tripState?.conversationMeta?.lastSuggestions,
      lastSuggestionsCity: tripState?.conversationMeta?.lastSuggestionsCity,
      lastSuggestionsRegion: tripState?.conversationMeta?.lastSuggestionsRegion,
      lastSuggestionsQuery: tripState?.conversationMeta?.lastSuggestionsQuery,
      lastSuggestionsAt: tripState?.conversationMeta?.lastSuggestionsAt,
    },
  }
}

export function mergeTripState(
  current: TripState,
  extracted: ExtractedUpdate,
): TripState {
  const nextOrigin = extracted.origin ?? current.origin
  const nextDestination = extracted.destination ?? current.destination
  const nextStops = mergeStops(
    current.stops,
    extracted.stops,
    nextOrigin,
    nextDestination,
  )
  const nextSavedPlacesByCity = mergeSavedPlacesByCity(
    current.savedPlacesByCity,
    extracted.savedPlaceAdds,
    extracted.savedPlaceRemoves,
  )
  const nextLikes = mergeUnique(current.preferences.likes, extracted.likes)
  const nextDislikes = mergeUnique(current.preferences.dislikes, extracted.dislikes)

  return {
    ...current,
    origin: nextOrigin,
    destination: nextDestination,
    daysTotal: extracted.daysTotal ?? current.daysTotal,
    stops: nextStops,
    savedPlacesByCity: nextSavedPlacesByCity,
    preferences: {
      ...current.preferences,
      likes: nextLikes,
      dislikes: nextDislikes,
      pace: extracted.pace ?? current.preferences.pace,
      budget: extracted.budget ?? current.preferences.budget,
    },
  }
}

function mergeStops(
  current: TripState['stops'],
  extractedStops: ExtractedUpdate['stops'],
  origin?: string,
  destination?: string,
): TripState['stops'] {
  const nextStops = current.map((stop) => ({ ...stop }))
  const blockedCities = new Set(
    [origin, destination]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase()),
  )

  extractedStops.forEach((mention) => {
    const mentionKey = mention.city.toLowerCase()
    if (blockedCities.has(mentionKey)) {
      return
    }

    const existingIndex = nextStops.findIndex(
      (stop) => stop.city.toLowerCase() === mentionKey,
    )

    if (existingIndex >= 0) {
      if (mention.deltaStayDays !== undefined) {
        const currentStayDays = nextStops[existingIndex].stayDays ?? 0
        nextStops[existingIndex] = {
          ...nextStops[existingIndex],
          stayDays: currentStayDays + mention.deltaStayDays,
        }
        return
      }

      if (mention.stayDays !== undefined) {
        nextStops[existingIndex] = {
          ...nextStops[existingIndex],
          stayDays: mention.stayDays,
        }
      }
      return
    }

    if (!mention.strongAppend) {
      return
    }

    nextStops.push({
      city: mention.city,
      stayDays: mention.stayDays ?? mention.deltaStayDays,
    })
  })

  return nextStops
}

function mergeSavedPlacesByCity(
  current: CitySavedPlaces[],
  adds: ExtractedUpdate['savedPlaceAdds'],
  removes: ExtractedUpdate['savedPlaceRemoves'],
): CitySavedPlaces[] {
  const next = current.map((entry) => ({
    city: entry.city,
    places: entry.places.map((place) => ({ ...place })),
  }))

  const indexByCity = new Map<string, number>()
  next.forEach((entry, index) => {
    indexByCity.set(entry.city.toLowerCase(), index)
  })

  adds.forEach((add) => {
    const city = add.city
    const placeName = add.placeName
    if (!city || !placeName) {
      return
    }

    const cityKey = city.toLowerCase()
    const place = {
      placeName,
      note: add.note,
      source: add.source ?? ('user' as const),
    }

    const knownIndex = indexByCity.get(cityKey)
    if (knownIndex === undefined) {
      next.push({ city, places: [place] })
      indexByCity.set(cityKey, next.length - 1)
      return
    }

    const cityEntry = next[knownIndex]
    const alreadyExists = cityEntry.places.some(
      (knownPlace) => knownPlace.placeName.toLowerCase() === placeName.toLowerCase(),
    )
    if (!alreadyExists) {
      cityEntry.places.push(place)
    }
  })

  removes.forEach((remove) => {
    const city = remove.city
    const placeName = remove.placeName
    if (!city || !placeName) {
      return
    }

    const knownIndex = indexByCity.get(city.toLowerCase())
    if (knownIndex === undefined) {
      return
    }

    const cityEntry = next[knownIndex]
    cityEntry.places = cityEntry.places.filter(
      (knownPlace) => knownPlace.placeName.toLowerCase() !== placeName.toLowerCase(),
    )
  })

  return next.filter((entry) => entry.places.length > 0)
}

function mergeUnique(current: string[], extracted: string[]): string[] {
  const merged = [...current]

  extracted.forEach((item) => {
    const exists = merged.some(
      (knownItem) => knownItem.toLowerCase() === item.toLowerCase(),
    )
    if (!exists) {
      merged.push(item)
    }
  })

  return merged
}

export function applyContextualShortAnswer(params: {
  currentState: TripState
  missingField: MissingField
  lastAskedField?: ConversationAskField
  message: string
  extracted: ExtractedUpdate
}): ExtractedUpdate {
  if (
    /\b(salvar|salva|guardar|guarda|adiciona|adicionar|incluir|inclui|remover|remove|tirar|tira|excluir|exclui|apagar|apaga|lista|listar|mostra|mostrar|sugere|sugest(ao|ão|oes|ões)|visitar|comer|fazer)\b/i.test(
      params.message,
    )
  ) {
    return params.extracted
  }

  const shouldPrioritizeDaysAnswer =
    params.lastAskedField === 'daysTotal' || params.missingField === 'daysTotal'
  if (shouldPrioritizeDaysAnswer && params.extracted.daysTotal === undefined) {
    const contextualDays = extractContextualDaysAnswer(params.message)
    if (contextualDays !== undefined) {
      return { ...params.extracted, daysTotal: contextualDays }
    }
  }

  if (params.missingField !== 'origin' && params.missingField !== 'destination') {
    return params.extracted
  }

  const shortPlaceAnswer = extractShortPlaceAnswer(params.message)
  if (!shortPlaceAnswer) {
    return params.extracted
  }

  if (
    params.missingField === 'origin' &&
    !params.currentState.origin &&
    !params.extracted.origin
  ) {
    return { ...params.extracted, origin: shortPlaceAnswer }
  }

  if (
    params.missingField === 'destination' &&
    !params.currentState.destination &&
    !params.extracted.destination
  ) {
    return { ...params.extracted, destination: shortPlaceAnswer }
  }

  return params.extracted
}

export function applyContextualPlaceReferences(params: {
  currentState: TripState
  extracted: ExtractedUpdate
  message: string
}): ExtractedUpdate {
  const referenceType = detectContextualReferenceType(params.message)
  if (!referenceType) {
    return params.extracted
  }

  const focus = resolveCurrentFocus(
    params.currentState,
    params.extracted,
    referenceType,
  )
  if (!focus) {
    return params.extracted
  }

  const contextualDays = extractContextualDaysAnswer(params.message)
  if (contextualDays === undefined) {
    return params.extracted
  }

  if (focus.field === 'destination') {
    const nextDaysTotal = applyDaysDeltaIfNeeded({
      currentDaysTotal: params.currentState.daysTotal,
      message: params.message,
      incomingDays: contextualDays,
    })

    return {
      ...params.extracted,
      daysTotal: params.extracted.daysTotal ?? nextDaysTotal,
    }
  }

  if (focus.field === 'stop') {
    const deltaDays = extractDeltaDays(params.message)
    return {
      ...params.extracted,
      daysTotal: params.currentState.daysTotal,
      stops: [
        ...params.extracted.stops,
        {
          city: focus.city,
          stayDays: deltaDays ? undefined : contextualDays,
          deltaStayDays: deltaDays ? contextualDays : undefined,
          strongAppend: true,
        },
      ],
    }
  }

  return params.extracted
}

export function resolveCurrentFocus(
  currentState: TripState,
  extracted: ExtractedUpdate,
  referenceType?: 'destination' | 'stop' | 'generic',
): { city: string; field: ConversationFocusField } | undefined {
  if (referenceType === 'destination') {
    if (currentState.destination) {
      return { city: currentState.destination, field: 'destination' }
    }
  }

  if (referenceType === 'stop') {
    const extractedStop = extracted.stops.at(-1)?.city
    if (extractedStop) {
      return { city: extractedStop, field: 'stop' }
    }

    const lastStop = currentState.stops.at(-1)?.city
    if (lastStop) {
      return { city: lastStop, field: 'stop' }
    }
  }

  const metaFocusCity = currentState.conversationMeta?.currentFocusCity
  const metaFocusField = currentState.conversationMeta?.currentFocusField

  if (metaFocusCity && metaFocusField) {
    return { city: metaFocusCity, field: metaFocusField }
  }

  const latestExtractedStop = extracted.stops.at(-1)?.city
  if (latestExtractedStop) {
    return { city: latestExtractedStop, field: 'stop' }
  }

  const lastStop = currentState.stops.at(-1)?.city
  if (lastStop) {
    return { city: lastStop, field: 'stop' }
  }

  if (currentState.destination) {
    return { city: currentState.destination, field: 'destination' }
  }

  if (currentState.origin) {
    return { city: currentState.origin, field: 'origin' }
  }

  return undefined
}

function detectContextualReferenceType(
  message: string,
): 'destination' | 'stop' | 'generic' | undefined {
  if (/\b(nesse destino|neste destino)\b/i.test(message)) {
    return 'destination'
  }
  if (/\b(nessa parada|nesta parada)\b/i.test(message)) {
    return 'stop'
  }
  if (/\b(l[aá]|ali|aqui)\b/i.test(message)) {
    return 'generic'
  }
  return undefined
}

function extractDeltaDays(message: string): boolean {
  return /\bmais\s+\d+\s*dias?\b/i.test(message)
}

function applyDaysDeltaIfNeeded(params: {
  currentDaysTotal?: number
  incomingDays: number
  message: string
}): number {
  if (!extractDeltaDays(params.message) || !params.currentDaysTotal) {
    return params.incomingDays
  }
  return params.currentDaysTotal + params.incomingDays
}

// Needed by conversation-extract for city hint from explicit message patterns
export { normalizeCity }
