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

Arquivos atuais:
- `plan-trip.ts`
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
  warnings: ['faltam opcoes grounded para a noite do dia 2'],
}
```
