# Pendências Críticas — Palm Map MVP

Este documento existe para evitar desvio de escopo. Antes de iniciar qualquer nova feature,
verifique se os itens abaixo foram resolvidos ou conscientemente adiados.

---

## Em andamento

- Fix CI deploy do Cloudflare Pages (web) — `VITE_API_BASE_URL` vazia no build de staging

---

## Técnico urgente

- **Erros de TypeScript pré-existentes**
  - `conversation-merge.ts` importa `ConversationAskField` que não existe no módulo `conversation-types`
  - Fixtures de teste (`conversation-decide.test.ts`) usando `GroundedSuggestionItem` sem campo `summary` obrigatório
  - Esses erros não quebram os testes nem o runtime, mas vão bloquear um build estrito futuro

- **Commit pendente**: alterações da revisão de risco (Eixos 1–3) ainda não commitadas
  - Arquivos: `conversation-update.ts`, `retrieve.ts`, `dataset-upload.ts`, `dataset-upload-api.ts`,
    `conversation-update-api.ts`, `useConversation.ts`, `DatasetManagerSheet.tsx`, `AGENTS.md`

---

## Pré-produção obrigatório

Estes itens **devem** ser resolvidos antes de qualquer exposição pública da API:

- **Token de sessão obrigatório**: o worker exige `X-Palm-Session-Token` em todas as rotas POST e o TokenGate no frontend precisa salvar esse valor antes que qualquer chamada seja feita. Consulte `docs/decisions/2026-03-31-session-token-gate.md` para gerar e distribuir o token nos ambientes.

- **Avaliação de qualidade do retrieval**: as 20–30 queries previstas na ADR 002 nunca foram
  executadas. Não sabemos se o retrieval text-match em D1 tem qualidade suficiente para suportar
  o fluxo conversacional em produção.

---

## Fora de escopo — trade-offs aceitos no MVP

Não implementar sem revisão explícita:

| Item | Razão para adiar |
|---|---|
| Vectorize (embeddings semânticos) | Text-match em D1 é suficiente para o volume atual |
| CORS restrito | API pública por design, sem sessão autenticada |
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
