# domain-trip

Responsabilidade: concentrar regras de construcao e organizacao do roteiro de viagem.

Pertence aqui:
- modelos do plano de viagem
- heuristicas de distribuicao por dias
- composicao de sub-roteiros para viagens longas
- validacao basica de consistencia do itinerario

Nao pertence aqui:
- persistencia de memoria
- detalhes de transporte HTTP
- integracao direta com providers externos

Dependencias esperadas:
- `packages/shared-types`
- contratos grounded de `packages/domain-retrieval`

Proximos arquivos importantes:
- entidades do roteiro
- servico de planificacao
- validadores de consistencia do itinerario