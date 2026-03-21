# shared-types

Responsabilidade: centralizar tipos e contratos compartilhados entre apps, dominios e agentes.

Pertence aqui:
- payloads de request e response
- tipos comuns de entidades
- enums e aliases simples reutilizados em varios pontos
- contratos fonte de verdade para comunicacao entre modulos

Nao pertence aqui:
- funcoes utilitarias
- logica de negocio
- adapters de providers

Dependencias esperadas:
- nenhuma obrigatoria no bootstrap

Proximos arquivos importantes:
- evolucoes do fluxo `plan-trip`
- contratos compartilhados de memoria explicita
- tipos grounded complementares de retrieval
- evolucao do fluxo conversacional centrado em `TripState`

Arquivos atuais:
- `plan-trip.ts`
- `conversational-trip.ts`
- `index.ts`

Exemplo de `PlanTripInput`:

```ts
const input = {
  origin: 'Fortaleza',
  destination: 'Recife',
  days: 3,
  preferencesText: 'gosto de praia, comida local e ritmo tranquilo',
}
```

Exemplo de `PlanTripResult`:

```ts
const result = {
  days: [
    {
      day: 1,
      items: [
        {
          name: 'Praia de Boa Viagem',
          location: 'Recife, PE',
          source: 'mock:recife-beaches',
          confidence: 0.92,
        },
      ],
    },
  ],
  effectivePreferencesText: 'gosto de praia, comida local e ritmo tranquilo',
  warnings: ['faltam opcoes grounded para a noite do dia 2'],
}
```

Exemplo de `TripState` (conversational MVP):

```ts
const tripState = {
  origin: 'Fortaleza',
  destination: 'Maceio',
  daysTotal: 5,
  stops: [
    { city: 'Recife', stayDays: 3 },
    { city: 'Olinda', stayDays: 2 },
  ],
  savedPlacesByCity: [
    {
      city: 'Recife',
      places: [
        { placeName: 'Mercado de Sao Jose', source: 'user' },
      ],
    },
  ],
  preferences: {
    likes: ['praia', 'comida local'],
    dislikes: ['balada'],
    pace: 'moderate',
    budget: 'medium',
  },
  conversationMeta: {
    lastAskedField: 'daysTotal',
    askedFieldsRecent: ['origin', 'destination', 'daysTotal'],
    lastResolvedField: 'destination',
    lastUserMessage: 'Natal',
    conversationStage: 'collecting_details',
    unresolvedFields: ['daysTotal'],
    currentFocusCity: 'Maceio',
    currentFocusField: 'destination',
    confidenceByField: {
      origin: 0.86,
      destination: 0.86,
    },
  },
  notes: 'chegada na sexta de noite',
}
```

Exemplo de update conversacional:

```ts
const updateInput = {
  message: 'Quero 2 dias em Olinda e prefiro viagem mais tranquila.',
  tripState,
}

const updateResult = {
  tripState: {
    ...tripState,
    stops: [
      { city: 'Recife', stayDays: 3 },
      { city: 'Olinda', stayDays: 2 },
    ],
    preferences: {
      ...tripState.preferences,
      pace: 'slow',
    },
  },
  suggestedRoute: {
    nodes: [
      { city: 'Fortaleza', role: 'origin' },
      { city: 'Recife', role: 'stop', stayDays: 3 },
      { city: 'Olinda', role: 'stop', stayDays: 2 },
      { city: 'Maceio', role: 'destination' },
    ],
    daysTotal: 5,
  },
  tripLegs: [
    { fromCity: 'Fortaleza', toCity: 'Recife', order: 1, stayDaysAtDestination: 3 },
    { fromCity: 'Recife', toCity: 'Olinda', order: 2, stayDaysAtDestination: 2 },
    { fromCity: 'Olinda', toCity: 'Maceio', order: 3 },
  ],
  assistantMessage: 'Sugestoes grounded em Recife: 1. Instituto Ricardo Brennand (Varzea).',
  groundedSuggestions: {
    city: 'Recife',
    query: 'o que vale visitar em Recife?',
    topK: 3,
    items: [
      {
        rank: 1,
        city: 'Recife',
        region: 'Varzea',
        title: 'Instituto Ricardo Brennand',
        category: 'attraction',
        summary: 'Complexo cultural com museu, pinacoteca e area externa ampla.',
        source: 'manual:recife-v1',
        score: 1,
        docId: 'recife-attraction-instituto-ricardo-brennand',
        chunkId: 'recife-attraction-instituto-ricardo-brennand-chunk-1',
      },
    ],
  },
  nextQuestion: 'Qual data aproximada de partida?',
}
```

Exemplo de retrieval (`/retrieve`):

```ts
const retrieveInput = {
  query: 'museu com acervo e arquitetura',
  city: 'Recife',
  topK: 3,
}

const retrieveResult = {
  query: 'museu com acervo e arquitetura',
  city: 'Recife',
  topK: 3,
  results: [
    {
      chunkId: 'recife-attraction-instituto-ricardo-brennand-chunk-1',
      docId: 'recife-attraction-instituto-ricardo-brennand',
      city: 'Recife',
      title: 'Instituto Ricardo Brennand',
      category: 'attraction',
      region: 'Varzea',
      summary: 'Complexo cultural com museu, biblioteca e area externa.',
      snippet: 'Colecao de arte, armas historicas e castelo com jardins.',
      tags: ['museu', 'arte', 'historia'],
      source: 'manual:recife-v1',
      updatedAt: '2026-03-20',
      score: 0.91,
    },
  ],
}
```
