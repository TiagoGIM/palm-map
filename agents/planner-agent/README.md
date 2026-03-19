# planner-agent

Responsabilidade: transformar entradas validadas e dados grounded em roteiro por dias.

Pertence aqui:
- criterios de montagem do plano
- regras de distribuicao simples
- estrategia para sub-roteiros
- composicao do roteiro a partir de fatos grounded ja validados

Nao pertence aqui:
- captura de memoria
- busca de fontes
- contratos HTTP

Dependencias esperadas:
- `packages/domain-trip`
- `packages/domain-retrieval`
- `packages/shared-types`

Proximos arquivos importantes:
- prompt do planner
- heuristicas de distribuicao por dias