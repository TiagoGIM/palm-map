import type { ExtractedUpdate } from '../../conversation-types'

export function emptyExtractedUpdate(overrides: Partial<ExtractedUpdate> = {}): ExtractedUpdate {
  return {
    stops: [],
    likes: [],
    dislikes: [],
    savedPlaceAdds: [],
    savedPlaceRemoves: [],
    savedPlaceListIntent: false,
    suggestionIntent: false,
    ...overrides,
  }
}

export function extractedWithOriginDestination(
  origin: string,
  destination: string,
): ExtractedUpdate {
  return emptyExtractedUpdate({ origin, destination })
}

export function extractedWithStop(city: string, stayDays?: number): ExtractedUpdate {
  return emptyExtractedUpdate({
    stops: [{ city, stayDays, strongAppend: true }],
  })
}

export function extractedWithPreferences(
  likes: string[],
  dislikes: string[],
): ExtractedUpdate {
  return emptyExtractedUpdate({ likes, dislikes })
}
