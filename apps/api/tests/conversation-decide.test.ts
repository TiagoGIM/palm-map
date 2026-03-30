import { describe, it, expect, vi } from 'vitest'
import type { GroundedSuggestions } from '../../../packages/shared-types'
import {
  computeUnresolvedFields,
  deriveConversationStage,
  getTurnProgress,
  buildSuggestedRoute,
  buildTripLegs,
  chooseNextQuestion,
  buildSuggestionsAssistantMessage,
} from '../conversation-decide'
import {
  emptyTripState,
  partialTripState,
  fullTripState,
  tripStateWithMeta,
} from './fixtures/trip-state'
import { emptyExtractedUpdate } from './fixtures/extracted-update'

// Mock logging (sem efeitos colaterais)
vi.mock('../conversation-logging', () => ({
  isLowConfidence: () => false,
  logExtractionMode: () => undefined,
  parseMinConfidence: () => 0.45,
}))

// Mock LLM adapter (importado transitivamente via conversation-extract)
vi.mock('../conversation-llm-adapter', () => ({
  extractStructuredWithLlm: async () => ({ ok: false, reason: 'llm_disabled' }),
}))

// ---------------------------------------------------------------------------
// computeUnresolvedFields
// ---------------------------------------------------------------------------
describe('computeUnresolvedFields', () => {
  it('TripState vazio → origin, destination e daysTotal como unresolved', () => {
    const fields = computeUnresolvedFields(emptyTripState())
    expect(fields).toContain('origin')
    expect(fields).toContain('destination')
    expect(fields).toContain('daysTotal')
  })

  it('com origin e destination preenchidos → apenas daysTotal', () => {
    const state = partialTripState()
    const fields = computeUnresolvedFields(state)
    expect(fields).not.toContain('origin')
    expect(fields).not.toContain('destination')
    expect(fields).toContain('daysTotal')
  })

  it('estado completo sem stops → sem campos unresolved', () => {
    const state = partialTripState({ daysTotal: 7 })
    const fields = computeUnresolvedFields(state)
    expect(fields).toHaveLength(0)
  })

  it('stop sem stayDays e sem daysTotal → adiciona stop_stay_days', () => {
    const state: ReturnType<typeof emptyTripState> = {
      ...emptyTripState(),
      origin: 'São Paulo',
      destination: 'Recife',
      stops: [{ city: 'Caruaru' }], // sem stayDays
    }
    const fields = computeUnresolvedFields(state)
    expect(fields).toContain('stop_stay_days')
  })

  it('stop sem stayDays mas com daysTotal → stop_stay_days não é unresolved', () => {
    const state: ReturnType<typeof emptyTripState> = {
      ...emptyTripState(),
      origin: 'São Paulo',
      destination: 'Recife',
      daysTotal: 7,
      stops: [{ city: 'Caruaru' }], // sem stayDays — mas daysTotal existe
    }
    const fields = computeUnresolvedFields(state)
    expect(fields).not.toContain('stop_stay_days')
  })
})

// ---------------------------------------------------------------------------
// deriveConversationStage
// ---------------------------------------------------------------------------
describe('deriveConversationStage', () => {
  it('com origin unresolved → collecting_core', () => {
    expect(deriveConversationStage(['origin', 'destination', 'daysTotal'])).toBe('collecting_core')
  })

  it('com destination unresolved → collecting_core', () => {
    expect(deriveConversationStage(['destination'])).toBe('collecting_core')
  })

  it('apenas daysTotal unresolved → collecting_details', () => {
    expect(deriveConversationStage(['daysTotal'])).toBe('collecting_details')
  })

  it('stop_stay_days unresolved → collecting_details', () => {
    expect(deriveConversationStage(['stop_stay_days'])).toBe('collecting_details')
  })

  it('sem campos unresolved → ready_to_suggest', () => {
    expect(deriveConversationStage([])).toBe('ready_to_suggest')
  })
})

// ---------------------------------------------------------------------------
// getTurnProgress
// ---------------------------------------------------------------------------
describe('getTurnProgress', () => {
  it('origin atualizado entre estados', () => {
    const prev = emptyTripState()
    const next = { ...emptyTripState(), origin: 'São Paulo' }
    const progress = getTurnProgress(prev, next)
    expect(progress.originUpdated).toBe(true)
    expect(progress.destinationUpdated).toBe(false)
  })

  it('destination atualizado entre estados', () => {
    const prev = emptyTripState()
    const next = { ...emptyTripState(), destination: 'Recife' }
    const progress = getTurnProgress(prev, next)
    expect(progress.destinationUpdated).toBe(true)
    expect(progress.originUpdated).toBe(false)
  })

  it('daysTotal atualizado entre estados', () => {
    const prev = partialTripState()
    const next = { ...partialTripState(), daysTotal: 10 }
    const progress = getTurnProgress(prev, next)
    expect(progress.daysTotalUpdated).toBe(true)
  })

  it('stop novo adicionado', () => {
    const prev = emptyTripState()
    const next = { ...emptyTripState(), stops: [{ city: 'Caruaru', stayDays: 2 }] }
    const progress = getTurnProgress(prev, next)
    expect(progress.stopsUpdated).toBe(true)
    expect(progress.stopStayUpdated).toBe(true)
  })

  it('nada mudou → todos os campos false', () => {
    const state = partialTripState()
    const progress = getTurnProgress(state, state)
    expect(progress.originUpdated).toBe(false)
    expect(progress.destinationUpdated).toBe(false)
    expect(progress.daysTotalUpdated).toBe(false)
    expect(progress.stopsUpdated).toBe(false)
    expect(progress.stopStayUpdated).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildSuggestedRoute
// ---------------------------------------------------------------------------
describe('buildSuggestedRoute', () => {
  it('estado incompleto (sem destination) → undefined', () => {
    const state = { ...emptyTripState(), origin: 'São Paulo' }
    expect(buildSuggestedRoute(state)).toBeUndefined()
  })

  it('estado sem stops → rota direta origin → destination', () => {
    const state = partialTripState()
    const route = buildSuggestedRoute(state)
    expect(route).toBeDefined()
    expect(route?.nodes).toHaveLength(2)
    expect(route?.nodes[0]?.role).toBe('origin')
    expect(route?.nodes[1]?.role).toBe('destination')
  })

  it('estado com stops → origin + stops + destination', () => {
    const state = fullTripState()
    const route = buildSuggestedRoute(state)
    expect(route?.nodes).toHaveLength(4) // origin + 2 stops + destination
    expect(route?.nodes[1]?.role).toBe('stop')
    expect(route?.nodes[2]?.role).toBe('stop')
  })

  it('stop com mesmo nome que destination é filtrado da rota', () => {
    const state: ReturnType<typeof emptyTripState> = {
      ...emptyTripState(),
      origin: 'São Paulo',
      destination: 'Recife',
      stops: [{ city: 'Recife', stayDays: 2 }], // stop = destination → deve ser filtrado
    }
    const route = buildSuggestedRoute(state)
    expect(route?.nodes).toHaveLength(2) // apenas origin e destination
  })

  it('inclui daysTotal na rota', () => {
    const state = partialTripState({ daysTotal: 7 })
    const route = buildSuggestedRoute(state)
    expect(route?.daysTotal).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// buildTripLegs
// ---------------------------------------------------------------------------
describe('buildTripLegs', () => {
  it('sem rota → undefined', () => {
    expect(buildTripLegs(undefined)).toBeUndefined()
  })

  it('rota com apenas 1 nó → undefined (precisa de pelo menos 2)', () => {
    expect(
      buildTripLegs({ nodes: [{ city: 'São Paulo', role: 'origin' }], daysTotal: 5 }),
    ).toBeUndefined()
  })

  it('rota sem stops → 1 leg', () => {
    const route = {
      nodes: [
        { city: 'São Paulo', role: 'origin' as const },
        { city: 'Recife', role: 'destination' as const },
      ],
      daysTotal: 5,
    }
    const legs = buildTripLegs(route)
    expect(legs).toHaveLength(1)
    expect(legs?.[0]?.fromCity).toBe('São Paulo')
    expect(legs?.[0]?.toCity).toBe('Recife')
    expect(legs?.[0]?.order).toBe(1)
  })

  it('rota com 2 stops → 3 legs', () => {
    const route = {
      nodes: [
        { city: 'São Paulo', role: 'origin' as const },
        { city: 'Caruaru', role: 'stop' as const, stayDays: 2 },
        { city: 'Olinda', role: 'stop' as const, stayDays: 3 },
        { city: 'Recife', role: 'destination' as const },
      ],
      daysTotal: 10,
    }
    const legs = buildTripLegs(route)
    expect(legs).toHaveLength(3)
    expect(legs?.[1]?.stayDaysAtDestination).toBe(3) // Olinda leg
  })
})

// ---------------------------------------------------------------------------
// buildSuggestionsAssistantMessage
// ---------------------------------------------------------------------------
describe('buildSuggestionsAssistantMessage', () => {
  it('formata até 3 sugestões corretamente', () => {
    const suggestions: GroundedSuggestions = {
      city: 'Recife',
      query: 'praias',
      topK: 3,
      items: [
        { rank: 1, title: 'Praia de Boa Viagem', region: 'Zona Sul', category: 'attraction', summary: 'Praia urbana de Recife.', source: 'manual', score: 0.9, docId: 'd1', chunkId: 'c1', city: 'Recife' },
        { rank: 2, title: 'Praia do Pina', region: 'Zona Sul', category: 'attraction', summary: 'Praia tranquila no Pina.', source: 'manual', score: 0.8, docId: 'd2', chunkId: 'c2', city: 'Recife' },
        { rank: 3, title: 'Piscinas de Gaibu', region: 'Cabo', category: 'attraction', summary: 'Piscinas naturais em Gaibu.', source: 'manual', score: 0.7, docId: 'd3', chunkId: 'c3', city: 'Recife' },
      ],
    }
    const message = buildSuggestionsAssistantMessage(suggestions)
    expect(message).toContain('Praia de Boa Viagem')
    expect(message).toContain('Praia do Pina')
    expect(message).toContain('Piscinas de Gaibu')
    expect(message).toContain('Recife')
  })

  it('ignora itens além dos 3 primeiros', () => {
    const suggestions: GroundedSuggestions = {
      city: 'Recife',
      query: 'tudo',
      topK: 5,
      items: [
        { rank: 1, title: 'A', region: 'X', category: 'attraction', summary: 'Lugar A.', source: 'manual', score: 1, docId: 'd1', chunkId: 'c1', city: 'Recife' },
        { rank: 2, title: 'B', region: 'X', category: 'attraction', summary: 'Lugar B.', source: 'manual', score: 0.9, docId: 'd2', chunkId: 'c2', city: 'Recife' },
        { rank: 3, title: 'C', region: 'X', category: 'attraction', summary: 'Lugar C.', source: 'manual', score: 0.8, docId: 'd3', chunkId: 'c3', city: 'Recife' },
        { rank: 4, title: 'D', region: 'X', category: 'attraction', summary: 'Lugar D.', source: 'manual', score: 0.7, docId: 'd4', chunkId: 'c4', city: 'Recife' },
      ],
    }
    const message = buildSuggestionsAssistantMessage(suggestions)
    expect(message).not.toContain('D')
  })
})

// ---------------------------------------------------------------------------
// chooseNextQuestion (integração)
// ---------------------------------------------------------------------------
describe('chooseNextQuestion', () => {
  const noGroundedResolution = {}

  it('estado vazio → pergunta origin', () => {
    const state = emptyTripState()
    const result = chooseNextQuestion({
      previousState: state,
      nextState: state,
      extracted: emptyExtractedUpdate(),
      userMessage: 'oi',
      groundedResolution: noGroundedResolution,
    })
    expect(result.askedField).toBe('origin')
    expect(result.nextQuestion).toBeTruthy()
  })

  it('origin preenchido → pergunta destination', () => {
    const state = { ...emptyTripState(), origin: 'São Paulo' }
    const result = chooseNextQuestion({
      previousState: state,
      nextState: state,
      extracted: emptyExtractedUpdate(),
      userMessage: 'São Paulo',
      groundedResolution: noGroundedResolution,
    })
    expect(result.askedField).toBe('destination')
  })

  it('origin + destination preenchidos → pergunta daysTotal', () => {
    const state = partialTripState()
    const result = chooseNextQuestion({
      previousState: state,
      nextState: state,
      extracted: emptyExtractedUpdate(),
      userMessage: 'Recife',
      groundedResolution: noGroundedResolution,
    })
    expect(result.askedField).toBe('daysTotal')
  })

  it('estado completo → sem nextQuestion (pronto para sugerir)', () => {
    const state = partialTripState({ daysTotal: 7 })
    const result = chooseNextQuestion({
      previousState: state,
      nextState: state,
      extracted: emptyExtractedUpdate(),
      userMessage: '7 dias',
      groundedResolution: noGroundedResolution,
    })
    expect(result.askedField).toBeUndefined()
    expect(result.nextQuestion).toBeUndefined()
  })

  it('quando completa os campos obrigatorios, sugere o proximo passo', () => {
    const previousState = partialTripState()
    const nextState = partialTripState({ daysTotal: 10 })
    const result = chooseNextQuestion({
      previousState,
      nextState,
      extracted: emptyExtractedUpdate({ daysTotal: 10 }),
      userMessage: 'vou ficar 10 dias',
      groundedResolution: noGroundedResolution,
    })
    expect(result.askedField).toBeUndefined()
    expect(result.nextQuestion).toBeUndefined()
    expect(result.assistantMessage).toContain('Quer que eu te traga sugestoes')
  })

  it('origin === destination → pergunta destination de novo', () => {
    const state = {
      ...partialTripState(),
      origin: 'Recife',
      destination: 'Recife', // inválido — mesmo que origem
    }
    const result = chooseNextQuestion({
      previousState: state,
      nextState: state,
      extracted: emptyExtractedUpdate(),
      userMessage: 'Recife',
      groundedResolution: noGroundedResolution,
    })
    expect(result.askedField).toBe('destination')
  })

  it('retorna needsCityQuestion do groundedResolution quando presente', () => {
    const state = partialTripState()
    const result = chooseNextQuestion({
      previousState: state,
      nextState: state,
      extracted: emptyExtractedUpdate(),
      userMessage: 'salvar esse lugar',
      groundedResolution: {
        needsCityQuestion: 'Em qual cidade fica esse lugar?',
      },
    })
    expect(result.askedField).toBe('saved_place_city')
    expect(result.nextQuestion).toBe('Em qual cidade fica esse lugar?')
  })

  it('retorna assistantMessage do groundedResolution quando presente', () => {
    const state = fullTripState()
    const result = chooseNextQuestion({
      previousState: state,
      nextState: state,
      extracted: emptyExtractedUpdate(),
      userMessage: 'o que visitar?',
      groundedResolution: {
        assistantMessage: 'Sugestões: 1. Lugar A | 2. Lugar B',
      },
    })
    expect(result.assistantMessage).toBe('Sugestões: 1. Lugar A | 2. Lugar B')
    expect(result.nextQuestion).toBeUndefined()
  })
})
