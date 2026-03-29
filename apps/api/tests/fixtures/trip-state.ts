import type { ConversationMeta, TripState } from '../../../../packages/shared-types'

export function emptyTripState(): TripState {
  return {
    stops: [],
    savedPlacesByCity: [],
    preferences: {
      likes: [],
      dislikes: [],
    },
  }
}

export function partialTripState(overrides: Partial<TripState> = {}): TripState {
  return {
    origin: 'São Paulo',
    destination: 'Recife',
    stops: [],
    savedPlacesByCity: [],
    preferences: {
      likes: [],
      dislikes: [],
    },
    ...overrides,
  }
}

export function fullTripState(): TripState {
  return {
    origin: 'São Paulo',
    destination: 'Recife',
    daysTotal: 10,
    stops: [
      { city: 'Caruaru', stayDays: 2 },
      { city: 'Olinda', stayDays: 3 },
    ],
    savedPlacesByCity: [
      {
        city: 'Recife',
        places: [
          { placeName: 'Mercado de São José', source: 'user' },
          { placeName: 'Pátio de São Pedro', source: 'retrieval' },
        ],
      },
    ],
    preferences: {
      likes: ['praias', 'gastronomia'],
      dislikes: ['multidão'],
      pace: 'moderate',
      budget: 'medium',
    },
  }
}

export function tripStateWithMeta(meta: Partial<ConversationMeta>): TripState {
  return {
    ...partialTripState(),
    conversationMeta: {
      askedFieldsRecent: [],
      unresolvedFields: [],
      ...meta,
    },
  }
}
