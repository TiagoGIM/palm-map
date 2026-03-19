# domain-trip Instructions

- O planner depende apenas de dados grounded.
- Nao invente lugares, eventos, duracoes ou deslocamentos.
- Organize o roteiro por dias com estrutura simples.
- Suporte sub-roteiros para viagens longas sem excesso de complexidade.
- Mantenha regras de priorizacao explicitadas em funcoes pequenas.

- Se os dados grounded forem insuficientes, retornar erro de planejamento ou plano parcial explicitamente marcado.
- Respeite restricoes simples de dias, ordem e consistencia basica do roteiro.
- Nao concentrar atividades demais em um unico dia sem justificativa clara.

- Nao implementar otimizacao avancada de rotas neste estagio.
- Priorize coerencia e simplicidade antes de eficiencia logistica.