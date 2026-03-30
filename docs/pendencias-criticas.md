# Pendências Críticas — Palm Map MVP

Este documento existe para evitar desvio de escopo. Antes de iniciar qualquer nova feature,
verifique se os itens abaixo foram resolvidos ou conscientemente adiados.

---

## Em andamento

- Validar em staging a rotação de `PALM_SESSION_TOKEN` (secret no Worker + atualização manual no TokenGate)

---

## Técnico urgente

- **Validação forte de sessão no backend**
  - O Worker agora compara `X-Palm-Session-Token` com `PALM_SESSION_TOKEN` e rejeita token ausente/inválido.
  - Precisamos manter o secret configurado em todos os ambientes de runtime da API para evitar `503 session_token_unconfigured`.

- **Continuidade da conversa quando estado fica completo**
  - O fluxo agora faz prompt pró-ativo de próximo passo quando origem/destino/duração ficam completos.
  - Monitorar em staging se isso elimina os casos de “chat parado” após coletar os campos essenciais.

---

## Pré-produção obrigatório

Estes itens **devem** ser resolvidos antes de qualquer exposição pública da API:

- **Token de sessão obrigatório**: o worker exige `X-Palm-Session-Token` em todas as rotas POST e valida contra `PALM_SESSION_TOKEN` do ambiente. O TokenGate no frontend precisa salvar esse valor antes de qualquer chamada. Consulte `docs/decisions/2026-03-31-session-token-gate.md` para rotação/distribuição.

- **Avaliação de qualidade do retrieval**: as 20–30 queries previstas na ADR 002 nunca foram
  executadas. Não sabemos se o retrieval text-match em D1 tem qualidade suficiente para suportar
  o fluxo conversacional em produção.

---

## Fora de escopo — trade-offs aceitos no MVP

Não implementar sem revisão explícita:

| Item | Razão para adiar |
|---|---|
| Vectorize (embeddings semânticos) | Text-match em D1 é suficiente para o volume atual |
| CORS restrito | API pública por design; proteção atual fica no token de sessão do Worker |
| Retry com backoff no LLM | Melhoria futura, não um bug |
| Multi-cidade além de Recife | Dataset limitado; expandir via Dataset Manager |
| Replanning durante a viagem | Fora do escopo do conversational MVP |
| Memória implícita / histórico profundo | Apenas preferências explícitas no MVP |
| Agenda detalhada / calendário | Fora de escopo (MVP product doc) |

---

## Referências

- `docs/product/mvp.md` — princípios e limitações do MVP
- `docs/product/conversational-mvp.md` — fases do MVP conversacional
- `docs/adr/002-real-rag-staging-architecture.md` — decisões de infra e retrieval
- `apps/api/AGENTS.md` — regras de API e trade-offs de segurança
