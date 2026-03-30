import { describe, it, expect, vi } from 'vitest'
import {
  extractDaysTotal,
  extractContextualDaysAnswer,
  extractShortPlaceAnswer,
  extractSuggestionIntent,
  normalizePlaceName,
  extractFromMessage,
} from '../conversation-extract'
import { emptyTripState, partialTripState, tripStateWithMeta } from './fixtures/trip-state'
import type { ConversationUpdateRuntimeEnv } from '../conversation-types'

// Mock LLM adapter to always return disabled (força path heurístico)
vi.mock('../conversation-llm-adapter', () => ({
  extractStructuredWithLlm: async () => ({ ok: false, reason: 'llm_disabled' }),
}))

// Mock logging (sem efeitos colaterais)
vi.mock('../conversation-logging', () => ({
  isLowConfidence: () => false,
  logExtractionMode: () => undefined,
  parseMinConfidence: () => 0.45,
}))

const mockEnv: ConversationUpdateRuntimeEnv = {
  CONVERSATION_LLM_ENABLED: 'false',
}

// ---------------------------------------------------------------------------
// extractDaysTotal
// ---------------------------------------------------------------------------
describe('extractDaysTotal', () => {
  it('extrai dias com "por X dias"', () => {
    expect(extractDaysTotal('por 5 dias')).toBe(5)
  })

  it('extrai dias com "durante X dias"', () => {
    expect(extractDaysTotal('durante 3 dias')).toBe(3)
  })

  it('extrai dias com "viagem de X dias"', () => {
    expect(extractDaysTotal('viagem de 10 dias')).toBe(10)
  })

  it('extrai dias com "roteiro de X dias"', () => {
    expect(extractDaysTotal('roteiro de 7 dias')).toBe(7)
  })

  it('extrai dias com "X dias de viagem"', () => {
    expect(extractDaysTotal('12 dias de viagem')).toBe(12)
  })

  it('extrai dias com "ficando X dias"', () => {
    expect(extractDaysTotal('saindo de natal, vou para salvador, ficando 10 dias')).toBe(10)
  })

  it('retorna undefined quando não há menção de dias', () => {
    expect(extractDaysTotal('quero ir para recife')).toBeUndefined()
  })

  it('retorna undefined para mensagem vazia', () => {
    expect(extractDaysTotal('')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// extractContextualDaysAnswer
// ---------------------------------------------------------------------------
describe('extractContextualDaysAnswer', () => {
  it('extrai dias de "vou passar X dias"', () => {
    expect(extractContextualDaysAnswer('vou passar 7 dias')).toBe(7)
  })

  it('extrai número de dias standalone', () => {
    expect(extractContextualDaysAnswer('10 dias')).toBe(10)
  })

  it('extrai dias com "planejo X dias"', () => {
    expect(extractContextualDaysAnswer('planejo 5 dias')).toBe(5)
  })

  it('retorna undefined para mensagem sem número', () => {
    expect(extractContextualDaysAnswer('quero visitar muitos lugares')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// extractShortPlaceAnswer
// ---------------------------------------------------------------------------
describe('extractShortPlaceAnswer', () => {
  it('aceita cidade simples', () => {
    expect(extractShortPlaceAnswer('Recife')).toBe('Recife')
  })

  it('aceita cidade com duas palavras', () => {
    expect(extractShortPlaceAnswer('São Paulo')).toBeTruthy()
  })

  it('rejeita frase com verbo de intenção', () => {
    expect(extractShortPlaceAnswer('quero ir para Recife')).toBeUndefined()
  })

  it('rejeita string com números', () => {
    expect(extractShortPlaceAnswer('Recife 5')).toBeUndefined()
  })

  it('rejeita string com mais de 4 palavras', () => {
    expect(extractShortPlaceAnswer('uma cidade muito bonita do nordeste')).toBeUndefined()
  })

  it('rejeita string vazia', () => {
    expect(extractShortPlaceAnswer('')).toBeUndefined()
  })

  it('rejeita string com a palavra "dias"', () => {
    expect(extractShortPlaceAnswer('5 dias')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// extractSuggestionIntent
// ---------------------------------------------------------------------------
describe('extractSuggestionIntent', () => {
  it('detecta "sugere" como intenção de sugestão', () => {
    const result = extractSuggestionIntent('sugere lugares pra comer')
    expect(result.triggered).toBe(true)
    expect(result.query).toBeTruthy()
  })

  it('detecta "o que vale visitar"', () => {
    const result = extractSuggestionIntent('o que vale visitar em Recife?')
    expect(result.triggered).toBe(true)
  })

  it('detecta "comer" como intenção de sugestão', () => {
    const result = extractSuggestionIntent('onde posso comer bem?')
    expect(result.triggered).toBe(true)
  })

  it('não dispara para mensagens de viagem sem intenção de sugestão', () => {
    const result = extractSuggestionIntent('quero ir para Recife por 5 dias')
    expect(result.triggered).toBe(false)
  })

  it('não dispara quando há verbo de salvar', () => {
    const result = extractSuggestionIntent('salvar a primeira opção')
    expect(result.triggered).toBe(false)
  })

  it('não dispara quando há verbo de listar', () => {
    const result = extractSuggestionIntent('lista os lugares salvos')
    expect(result.triggered).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// normalizePlaceName
// ---------------------------------------------------------------------------
describe('normalizePlaceName', () => {
  it('retorna undefined para undefined', () => {
    expect(normalizePlaceName(undefined)).toBeUndefined()
  })

  it('remove pontuação final', () => {
    expect(normalizePlaceName('Recife,')).toBe('Recife')
  })

  it('remove "esse lugar" e retorna undefined', () => {
    expect(normalizePlaceName('esse lugar')).toBeUndefined()
  })

  it('remove "esse local" e retorna undefined', () => {
    expect(normalizePlaceName('esse local')).toBeUndefined()
  })

  it('preserva nome válido de lugar', () => {
    expect(normalizePlaceName('Mercado de São José')).toBe('Mercado de São José')
  })

  it('retorna undefined para string vazia', () => {
    expect(normalizePlaceName('')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// extractFromMessage (integração heurística completa)
// ---------------------------------------------------------------------------
describe('extractFromMessage (heurística)', () => {
  it('extrai rota completa: origem, destino e dias', async () => {
    const result = await extractFromMessage({
      message: 'Quero ir de São Paulo para Recife por 5 dias',
      tripState: emptyTripState(),
      env: mockEnv,
    })

    expect(result.origin).toBeTruthy()
    expect(result.destination).toBeTruthy()
    expect(result.daysTotal).toBe(5)
  })

  it('extrai preferências: likes e dislikes', async () => {
    const result = await extractFromMessage({
      message: 'Gosto de praias e gastronomia, não gosto de multidão',
      tripState: emptyTripState(),
      env: mockEnv,
    })

    expect(result.likes).toContain('praias')
    expect(result.likes).toContain('gastronomia')
    expect(result.dislikes).toContain('multidão')
  })

  it('extrai parada com dias de estadia', async () => {
    const result = await extractFromMessage({
      message: 'Quero passar 2 dias em Caruaru',
      tripState: emptyTripState(),
      env: mockEnv,
    })

    const carauruStop = result.stops.find(
      (s) => s.city.toLowerCase() === 'caruaru',
    )
    expect(carauruStop).toBeDefined()
    expect(carauruStop?.stayDays).toBe(2)
  })

  it('detecta intenção de sugestão na mensagem', async () => {
    const result = await extractFromMessage({
      message: 'Sugere lugares para visitar em Recife',
      tripState: partialTripState({ destination: 'Recife' }),
      env: mockEnv,
    })

    expect(result.suggestionIntent).toBe(true)
  })

  it('extrai destino de "chegar em X"', async () => {
    const result = await extractFromMessage({
      message: 'Quero passar 3 dias em Caruaru antes de chegar em Recife',
      tripState: emptyTripState(),
      env: mockEnv,
    })
    expect(result.destination?.toLowerCase()).toBe('recife')
    const carauruStop = result.stops.find((s) => s.city.toLowerCase() === 'caruaru')
    expect(carauruStop?.stayDays).toBe(3)
  })

  it('extrai budget "econômica" com acento', async () => {
    const result = await extractFromMessage({
      message: 'Quero uma viagem econômica e tranquila',
      tripState: emptyTripState(),
      env: mockEnv,
    })
    expect(result.budget).toBe('low')
  })

  it('extrai a 1ª parada com dias de "passando por X N dias"', async () => {
    // A heurística captura a 1ª cidade da cadeia "passando por X N dias e Y N dias".
    // Múltiplas paradas em cadeia exigem LLM (limite da abordagem regex).
    const result = await extractFromMessage({
      message: 'De Brasília, passando por Goiânia 2 dias e Uberlândia 1 dia, até Belo Horizonte',
      tripState: emptyTripState(),
      env: mockEnv,
    })
    const goiania = result.stops.find(
      (s) => s.city.toLowerCase().includes('goiânia') || s.city.toLowerCase().includes('goiania'),
    )
    expect(goiania?.stayDays).toBe(2)
  })

  it('detecta intenção de salvar por referência ordinal', async () => {
    const now = new Date().toISOString()
    const stateWithSuggestions = tripStateWithMeta({
      lastSuggestions: [
        {
          rank: 1,
          title: 'Mercado de São José',
          city: 'Recife',
          category: 'food_cafe',
          summary: 'Mercado histórico do Recife.',
          region: 'Centro',
          source: 'manual',
          score: 0.9,
          docId: 'doc1',
          chunkId: 'chunk1',
        },
      ],
      lastSuggestionsAt: now,
      currentFocusCity: 'Recife',
    })

    const result = await extractFromMessage({
      message: 'Salvar a primeira opção',
      tripState: stateWithSuggestions,
      env: mockEnv,
    })

    expect(result.savedPlaceAdds).toHaveLength(1)
    expect(result.savedPlaceAdds[0]?.placeName).toBe('Mercado de São José')
  })
})
