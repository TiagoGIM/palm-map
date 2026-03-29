# apps/api Instructions

- Construa endpoints pequenos e com responsabilidade clara.
- Mantenha contratos de entrada e saida explicitos.
- Valide input e output desde o inicio.

- A API nao deve conter logica de decisao de negocio.
- A API apenas orquestra chamadas entre dominios.

- Orquestre o fluxo de forma explicita:
  1. memoria
  2. retrieval
  3. planner

- Evite espalhar logica de dominio dentro de handlers.
- Delegue regras para `packages/domain-*` sempre que o contrato existir.

- Nao retornar dados desnecessarios.
- Respostas devem conter apenas o necessario para o cliente.

- Padronizar respostas de erro com estrutura simples e consistente.

- Nao acoplar diretamente a API a implementacoes internas de agentes.
- A API deve depender de contratos, nao de detalhes internos.

- Prefira mocks e adapters simples antes de providers reais.

## Trade-offs aceitos (MVP)

- **CORS wildcard** (`API_ALLOWED_ORIGIN = "*"`): API publica por design — nao ha sessao autenticada.
- **`/dataset/upload` sem autenticacao**: Aceitavel em staging privado. Antes de ir para producao, proteger o endpoint com um shared secret (header `X-Upload-Key`) ou restringir por IP/origin.