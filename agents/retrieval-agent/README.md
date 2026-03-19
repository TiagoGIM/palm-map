# retrieval-agent

Responsabilidade: descrever o agente que coleta referencias confiaveis para o plano.

Pertence aqui:
- formato de saida grounded
- filtros de confianca
- criterios de exclusao de resultados fracos
- selecao de resultados compactos para consumo do planner

Nao pertence aqui:
- montagem do itinerario final
- persistencia de memoria
- detalhes de UI

Dependencias esperadas:
- `packages/domain-retrieval`
- `packages/shared-types`

Proximos arquivos importantes:
- prompt do agente
- fixtures de retrieval