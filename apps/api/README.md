# apps/api

Responsabilidade: expor a camada HTTP do MVP e orquestrar chamadas para dominios e agentes.

Pertence aqui:
- endpoints do fluxo principal
- serializacao e validacao de payloads
- orquestracao entre dominios e montagem da resposta final minima

Nao pertence aqui:
- implementacao detalhada de regras de negocio
- fixtures de UI
- codigo de agenda complexa
- enriquecimento ou transformacao de dados alem do necessario para resposta

Dependencias esperadas:
- `packages/domain-trip`
- `packages/domain-memory`
- `packages/domain-retrieval`
- `packages/shared-types`

- contratos definidos em `packages/shared-types` sao a fonte de verdade da API

Proximos arquivos importantes:
- novos endpoints do fluxo principal
- validadores leves de request e response
- camada de orquestracao do MVP

Arquivos atuais:
- `plan-trip.ts`
- `index.ts`
