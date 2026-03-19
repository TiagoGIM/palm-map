# apps/api

Responsabilidade: expor a camada HTTP do MVP e orquestrar chamadas para dominios e agentes.

## Fluxo esperado do MVP

1. receber request do usuario
2. consultar memoria de preferencias
3. executar retrieval de dados grounded
4. chamar planner para montar roteiro
5. retornar resposta estruturada

Pertence aqui:
- endpoints do fluxo principal
- serializacao e validacao de payloads
- orquestracao entre dominios e montagem da resposta final

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

- contratos definidos em `packages/shared-types` sao a fonte de verdade

Proximos arquivos importantes:
- contrato do endpoint `plan-trip`
- validadores de request e response
- camada de orquestracao do MVP
- padronizacao simples de erros

Arquivos atuais:
- `plan-trip.ts`
- `index.ts`
