# agents

Responsabilidade: documentar os agentes do produto, seus papeis, limites e handoffs no fluxo do MVP.

Pertence aqui:
- responsabilidades por agente
- definicao de papeis, limites e handoffs entre agentes
- prompts e contratos de handoff futuros

Nao pertence aqui:
- implementacao de app
- infraestrutura
- implementacao concreta de regras de dominio
- handlers HTTP
- componentes de interface

Dependencias esperadas:
- `packages/domain-*`
- `packages/shared-types`

- agentes devem se comunicar por contratos claros e estaveis

Proximos arquivos importantes:
- prompts operacionais
- contratos entre orchestrator e agentes especializados
- definicao do fluxo canonico entre agentes