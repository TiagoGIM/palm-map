# orchestrator

Responsabilidade: descrever o agente que coordena o fluxo principal do produto.

Pertence aqui:
- papel do agente
- contratos esperados de entrada e saida
- estrategia de composicao entre dominios

Nao pertence aqui:
- implementacao HTTP
- UI
- adapters concretos de provider

Dependencias esperadas:
- `agents/profile-agent`
- `agents/planner-agent`
- `agents/retrieval-agent`
- `packages/shared-types`

Proximos arquivos importantes:
- prompt operacional
- contrato de handoff entre agentes