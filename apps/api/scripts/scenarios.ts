/**
 * Cenários de teste para o pipeline de extração de conversa.
 * Cada cenário define uma mensagem do usuário, um estado anterior opcional,
 * e os campos esperados na ExtractedUpdate resultante.
 */

import type { TripState } from '../../../packages/shared-types'
import type { ExtractedUpdate } from '../conversation-types'

export type ScenarioExpectation = {
  origin?: string
  destination?: string
  daysTotal?: number
  stopCities?: string[]         // cidades esperadas nos stops (case-insensitive)
  stopStayDays?: Record<string, number> // { cidade: dias }
  likes?: string[]              // itens esperados em likes (subset check)
  dislikes?: string[]           // itens esperados em dislikes (subset check)
  pace?: ExtractedUpdate['pace']
  budget?: ExtractedUpdate['budget']
  suggestionIntent?: boolean
}

export type Scenario = {
  id: string
  label: string
  message: string
  previousState?: Partial<TripState>
  expected: ScenarioExpectation
}

export const scenarios: Scenario[] = [
  {
    id: 'S01',
    label: 'Rota completa em uma mensagem',
    message: 'Quero ir de São Paulo para Recife por 7 dias',
    expected: {
      origin: 'São Paulo',
      destination: 'Recife',
      daysTotal: 7,
    },
  },

  {
    id: 'S02',
    label: 'Resposta curta — só cidade (contexto: origin pendente)',
    message: 'Fortaleza',
    previousState: {
      conversationMeta: {
        lastAskedField: 'origin',
        askedFieldsRecent: ['origin'],
        unresolvedFields: ['origin', 'destination', 'daysTotal'],
      },
    },
    expected: {
      origin: 'Fortaleza',
    },
  },

  {
    id: 'S03',
    label: 'Preferências simples: likes e dislikes',
    message: 'Gosto de praias e gastronomia local, não gosto de multidão',
    expected: {
      likes: ['praias'],
      dislikes: ['multidão'],
    },
  },

  {
    id: 'S04',
    label: 'Parada com dias de estadia',
    message: 'Quero passar 3 dias em Caruaru antes de chegar em Recife',
    expected: {
      destination: 'Recife',
      stopCities: ['Caruaru'],
      stopStayDays: { caruaru: 3 },
    },
  },

  {
    id: 'S05',
    label: 'Multi-campo: origin + destination + dias + pace',
    message: 'Saindo de Natal, vou para Salvador, ficando 10 dias, ritmo tranquilo',
    expected: {
      origin: 'Natal',
      destination: 'Salvador',
      daysTotal: 10,
      pace: 'slow',
    },
  },

  {
    id: 'S06',
    label: 'Intenção de sugestão',
    message: 'O que vale visitar em Olinda?',
    expected: {
      suggestionIntent: true,
    },
  },

  {
    id: 'S07',
    label: 'Mensagem ambígua (sem campos identificáveis)',
    message: 'Quero uma viagem diferente esse ano',
    expected: {
      // nenhum campo esperado — extração deve ser vazia mas sem erro
    },
  },

  {
    id: 'S08',
    label: 'Destino com preposição "pra"',
    message: 'Estou pensando em ir pra Florianópolis por 5 dias',
    expected: {
      destination: 'Florianópolis',
      daysTotal: 5,
    },
  },

  {
    id: 'S09',
    label: 'Múltiplas paradas com dias',
    message: 'De Brasília, passando por Goiânia 2 dias e Uberlândia 1 dia, até Belo Horizonte',
    expected: {
      origin: 'Brasília',
      destination: 'Belo Horizonte',
      stopCities: ['Goiânia', 'Uberlândia'],
      stopStayDays: { goiânia: 2, uberlândia: 1 },
    },
  },

  {
    id: 'S10',
    label: 'Budget + pace + likes combinados',
    message: 'Quero uma viagem econômica e tranquila, gosto de museus e história',
    expected: {
      budget: 'low',
      pace: 'slow',
      likes: ['museus', 'história'],
    },
  },
]
