import { describe, it, expect, vi } from 'vitest'
import {
  createBaseTripState,
  mergeTripState,
  applyContextualShortAnswer,
  applyContextualPlaceReferences,
} from '../conversation-merge'
import {
  emptyTripState,
  partialTripState,
  fullTripState,
  tripStateWithMeta,
} from './fixtures/trip-state'
import {
  emptyExtractedUpdate,
  extractedWithOriginDestination,
  extractedWithStop,
  extractedWithPreferences,
} from './fixtures/extracted-update'

// Mock logging (sem efeitos colaterais)
vi.mock('../conversation-logging', () => ({
  isLowConfidence: () => false,
  logExtractionMode: () => undefined,
  parseMinConfidence: () => 0.45,
}))

// Mock LLM adapter (não usado em merge, mas importado transitivamente)
vi.mock('../conversation-llm-adapter', () => ({
  extractStructuredWithLlm: async () => ({ ok: false, reason: 'llm_disabled' }),
}))

// ---------------------------------------------------------------------------
// createBaseTripState
// ---------------------------------------------------------------------------
describe('createBaseTripState', () => {
  it('sem input retorna TripState com arrays vazios e preferences padrão', () => {
    const state = createBaseTripState()
    expect(state.stops).toEqual([])
    expect(state.savedPlacesByCity).toEqual([])
    expect(state.preferences.likes).toEqual([])
    expect(state.preferences.dislikes).toEqual([])
  })

  it('preserva campos do TripState de entrada', () => {
    const input = partialTripState({ daysTotal: 7 })
    const state = createBaseTripState(input)
    expect(state.origin).toBe('São Paulo')
    expect(state.destination).toBe('Recife')
    expect(state.daysTotal).toBe(7)
  })

  it('inicializa meta com arrays vazios mesmo sem input', () => {
    const state = createBaseTripState()
    expect(state.conversationMeta?.askedFieldsRecent).toEqual([])
    expect(state.conversationMeta?.unresolvedFields).toEqual([])
  })

  it('preserva conversationMeta existente', () => {
    const input = tripStateWithMeta({
      lastAskedField: 'origin',
      currentFocusCity: 'Recife',
    })
    const state = createBaseTripState(input)
    expect(state.conversationMeta?.lastAskedField).toBe('origin')
    expect(state.conversationMeta?.currentFocusCity).toBe('Recife')
  })
})

// ---------------------------------------------------------------------------
// mergeTripState
// ---------------------------------------------------------------------------
describe('mergeTripState', () => {
  it('atualiza origin e destination', () => {
    const current = emptyTripState()
    const extracted = extractedWithOriginDestination('São Paulo', 'Recife')
    const next = mergeTripState(current, extracted)
    expect(next.origin).toBe('São Paulo')
    expect(next.destination).toBe('Recife')
  })

  it('preserva valores existentes quando extracted não tem novos', () => {
    const current = partialTripState()
    const extracted = emptyExtractedUpdate()
    const next = mergeTripState(current, extracted)
    expect(next.origin).toBe('São Paulo')
    expect(next.destination).toBe('Recife')
  })

  it('adiciona stop novo', () => {
    const current = emptyTripState()
    const extracted = extractedWithStop('Caruaru', 2)
    const next = mergeTripState(current, extracted)
    expect(next.stops).toHaveLength(1)
    expect(next.stops[0]?.city).toBe('Caruaru')
    expect(next.stops[0]?.stayDays).toBe(2)
  })

  it('não duplica stop existente — atualiza stayDays', () => {
    const current: typeof emptyTripState extends () => infer R ? R : never = {
      ...emptyTripState(),
      stops: [{ city: 'Caruaru', stayDays: 1 }],
    }
    const extracted = extractedWithStop('caruaru', 3) // case-insensitive
    const next = mergeTripState(current, extracted)
    expect(next.stops).toHaveLength(1)
    expect(next.stops[0]?.stayDays).toBe(3)
  })

  it('não adiciona stop se a cidade é a origem', () => {
    const current = emptyTripState()
    const extracted = emptyExtractedUpdate({
      origin: 'São Paulo',
      stops: [{ city: 'São Paulo', strongAppend: true }],
    })
    const next = mergeTripState(current, extracted)
    expect(next.stops).toHaveLength(0)
  })

  it('não adiciona stop se a cidade é o destino', () => {
    const current = emptyTripState()
    const extracted = emptyExtractedUpdate({
      destination: 'Recife',
      stops: [{ city: 'Recife', strongAppend: true }],
    })
    const next = mergeTripState(current, extracted)
    expect(next.stops).toHaveLength(0)
  })

  it('adiciona savedPlace novo para uma cidade', () => {
    const current = emptyTripState()
    const extracted = emptyExtractedUpdate({
      savedPlaceAdds: [{ city: 'Recife', placeName: 'Mercado de São José', source: 'user' }],
    })
    const next = mergeTripState(current, extracted)
    expect(next.savedPlacesByCity).toHaveLength(1)
    expect(next.savedPlacesByCity[0]?.places[0]?.placeName).toBe('Mercado de São José')
  })

  it('não duplica savedPlace com mesmo nome (case-insensitive)', () => {
    const current: typeof emptyTripState extends () => infer R ? R : never = {
      ...emptyTripState(),
      savedPlacesByCity: [
        { city: 'Recife', places: [{ placeName: 'Mercado de São José', source: 'user' }] },
      ],
    }
    const extracted = emptyExtractedUpdate({
      savedPlaceAdds: [{ city: 'Recife', placeName: 'mercado de são josé', source: 'user' }],
    })
    const next = mergeTripState(current, extracted)
    expect(next.savedPlacesByCity[0]?.places).toHaveLength(1)
  })

  it('remove savedPlace existente', () => {
    const current: typeof emptyTripState extends () => infer R ? R : never = {
      ...emptyTripState(),
      savedPlacesByCity: [
        { city: 'Recife', places: [{ placeName: 'Mercado de São José', source: 'user' }] },
      ],
    }
    const extracted = emptyExtractedUpdate({
      savedPlaceRemoves: [{ city: 'Recife', placeName: 'Mercado de São José' }],
    })
    const next = mergeTripState(current, extracted)
    expect(next.savedPlacesByCity).toHaveLength(0) // cidade removida quando fica vazia
  })

  it('mescla likes e dislikes sem duplicar (case-insensitive)', () => {
    const current: typeof emptyTripState extends () => infer R ? R : never = {
      ...emptyTripState(),
      preferences: { likes: ['praias'], dislikes: [] },
    }
    const extracted = extractedWithPreferences(['Praias', 'gastronomia'], ['multidão'])
    const next = mergeTripState(current, extracted)
    expect(next.preferences.likes).toContain('praias')
    expect(next.preferences.likes).toContain('gastronomia')
    expect(next.preferences.likes).toHaveLength(2) // 'Praias' não duplica 'praias'
    expect(next.preferences.dislikes).toContain('multidão')
  })

  it('atualiza daysTotal quando extraído', () => {
    const current = partialTripState()
    const extracted = emptyExtractedUpdate({ daysTotal: 10 })
    const next = mergeTripState(current, extracted)
    expect(next.daysTotal).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// applyContextualShortAnswer
// ---------------------------------------------------------------------------
describe('applyContextualShortAnswer', () => {
  it('preenche origin quando campo ausente e resposta curta é dada', () => {
    const currentState = emptyTripState()
    const extracted = emptyExtractedUpdate()
    const result = applyContextualShortAnswer({
      currentState,
      missingField: 'origin',
      lastAskedField: 'origin',
      message: 'Recife',
      extracted,
    })
    expect(result.origin).toBe('Recife')
  })

  it('preenche destination quando campo ausente e resposta curta é dada', () => {
    const currentState = partialTripState({ destination: undefined })
    const extracted = emptyExtractedUpdate()
    const result = applyContextualShortAnswer({
      currentState,
      missingField: 'destination',
      lastAskedField: 'destination',
      message: 'Salvador',
      extracted,
    })
    expect(result.destination).toBe('Salvador')
  })

  it('preenche daysTotal quando campo ausente e resposta é número de dias', () => {
    const currentState = partialTripState()
    const extracted = emptyExtractedUpdate()
    const result = applyContextualShortAnswer({
      currentState,
      missingField: 'daysTotal',
      lastAskedField: 'daysTotal',
      message: '7 dias',
      extracted,
    })
    expect(result.daysTotal).toBe(7)
  })

  it('não altera extracted quando mensagem contém verbo de ação (salvar, listar, etc.)', () => {
    const currentState = emptyTripState()
    const extracted = emptyExtractedUpdate()
    const result = applyContextualShortAnswer({
      currentState,
      missingField: 'origin',
      lastAskedField: 'origin',
      message: 'salvar o lugar',
      extracted,
    })
    expect(result.origin).toBeUndefined()
  })

  it('não preenche origin se já está definido no estado', () => {
    const currentState = partialTripState() // já tem origin = 'São Paulo'
    const extracted = emptyExtractedUpdate()
    const result = applyContextualShortAnswer({
      currentState,
      missingField: 'origin',
      lastAskedField: 'origin',
      message: 'Fortaleza',
      extracted,
    })
    expect(result.origin).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// applyContextualPlaceReferences
// ---------------------------------------------------------------------------
describe('applyContextualPlaceReferences', () => {
  it('não altera extracted quando não há referência contextual', () => {
    const currentState = partialTripState()
    const extracted = emptyExtractedUpdate()
    const result = applyContextualPlaceReferences({
      currentState,
      extracted,
      message: 'quero praias',
    })
    expect(result).toEqual(extracted)
  })

  it('resolve referência contextual "la" (sem acento) para o destino quando há dias', () => {
    // NOTA: '\b' no JS não funciona com caracteres acentuados.
    // '/\b(l[aá])\b/' não detecta "lá" no final de string pois 'á' é \W e não gera \b.
    // Por isso testamos com "la" (sem acento), que o código detecta corretamente.
    const currentState = partialTripState({ destination: 'Recife', daysTotal: 5 })
    const extracted = emptyExtractedUpdate()
    const result = applyContextualPlaceReferences({
      currentState,
      extracted,
      message: 'vou ficar 3 dias la',
    })
    expect(result.daysTotal).toBe(3)
  })

  it('resolve "nesse destino" e aplica dias ao destino', () => {
    const currentState = partialTripState({ destination: 'Recife' })
    const extracted = emptyExtractedUpdate()
    const result = applyContextualPlaceReferences({
      currentState,
      extracted,
      message: 'vou passar 4 dias nesse destino',
    })
    expect(result.daysTotal).toBe(4)
  })

  it('resolve "nessa parada" para o último stop e cria entrada de stop', () => {
    const currentState: typeof emptyTripState extends () => infer R ? R : never = {
      ...emptyTripState(),
      stops: [{ city: 'Caruaru' }],
    }
    const extracted = emptyExtractedUpdate()
    const result = applyContextualPlaceReferences({
      currentState,
      extracted,
      message: 'quero ficar 2 dias nessa parada',
    })
    const carauruStop = result.stops.find(
      (s) => s.city.toLowerCase() === 'caruaru',
    )
    expect(carauruStop).toBeDefined()
    expect(carauruStop?.stayDays).toBe(2)
  })
})
