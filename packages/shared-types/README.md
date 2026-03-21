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
    { city: 'Recife', stayDays: 3, savedPlaces: ['Marco Zero'] },
    { city: 'Olinda', stayDays: 2 },
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
    lastUserTurn: 'Natal',
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
      { city: 'Recife', stayDays: 3, savedPlaces: ['Marco Zero'] },
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
  nextQuestion: 'Qual data aproximada de partida?',
}
```
