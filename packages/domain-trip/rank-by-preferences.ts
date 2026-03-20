import type { PlaceCandidate } from '../shared-types'

type RankPlacesByPreferencesInput = {
  places: PlaceCandidate[]
  preferencesText?: string
}

export function rankPlacesByPreferences(
  input: RankPlacesByPreferencesInput,
): PlaceCandidate[] {
  if (!input.preferencesText) {
    return input.places
  }

  const tokens = tokenizePreferences(input.preferencesText)
  if (tokens.length === 0) {
    return input.places
  }

  const withScore = input.places.map((place, index) => {
    const haystack = `${place.name} ${place.location}`.toLowerCase()
    const matched = tokens.filter((token) => haystack.includes(token)).length

    return {
      place,
      index,
      matched,
    }
  })

  const hasAnyMatch = withScore.some((entry) => entry.matched > 0)
  if (!hasAnyMatch) {
    return input.places
  }

  return [...withScore]
    .sort((a, b) => {
      if (a.matched !== b.matched) {
        return b.matched - a.matched
      }

      if (a.place.confidence !== b.place.confidence) {
        return b.place.confidence - a.place.confidence
      }

      return a.index - b.index
    })
    .map((entry) => entry.place)
}

function tokenizePreferences(preferencesText: string): string[] {
  return preferencesText
    .toLowerCase()
    .split(/[^a-z0-9\u00c0-\u024f]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
}
