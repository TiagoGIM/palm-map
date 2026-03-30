# Dataset Manager — upload via IA externa com UI e API

**Data:** 2026-03-29
**Status:** Implementado

## Problema

O fluxo anterior para adicionar dados ao app exigia CLI (`generate-dataset.mjs` + `ingest.mjs`) e redeploy do Worker. Chunks ficavam hardcoded em arquivos `.ts` no bundle — impossível atualizar em produção sem deploys de código.

## Decisão

Implementar um Dataset Manager acessível pelo próprio app que permite:

1. **Gerar dados com IA externa**: o usuário copia um prompt template, pede para Claude.ai ou ChatGPT gerar o JSON de lugares, e cola no app.
2. **Validar antes de enviar**: validação client-side em tempo real (mesmas regras do servidor).
3. **Upload via API**: `POST /api/dataset/upload` valida, chunka e persiste no D1.
4. **Retrieval aumentado**: retrieval passa a combinar chunks locais (bundle) + chunks do D1.

## Alternativas consideradas

| Opção | Rejeitada porque |
|---|---|
| Vectorize (embeddings) | Latência e custo de embedding por query; complexidade desnecessária no MVP |
| R2 para armazenar JSON | Não resolve o problema de retrieval em tempo de execução |
| Manter só CLI/repo | Bloqueia updates sem deploys; não escalável para não-devs |
| Substituir chunks locais por D1 | Perda do fallback estático; risco desnecessário |

## Arquitetura

```
[Usuário] copia prompt template
    → pede para IA externa gerar JSON de lugares
    → cola JSON no DatasetManagerSheet (web app)
    → validação client-side imediata
    → preview da tabela de documentos válidos
    → clica "Upload" → POST /api/dataset/upload
    → API valida + chunka + upsert em D1 (document_chunks)
    → retrieval combina chunks locais + D1 por cidade
```

## Arquivos criados/modificados

| Arquivo | Operação | Descrição |
|---|---|---|
| `packages/domain-memory/migrations/002_document_chunks.sql` | criado | Tabela D1 para chunks uploadados |
| `packages/shared-types/dataset-upload.ts` | criado | Tipos do contrato de upload |
| `packages/shared-types/index.ts` | modificado | Exporta novos tipos |
| `packages/domain-memory/index.ts` | modificado | Adiciona `batch()` ao D1Database |
| `apps/api/dataset-upload.ts` | criado | Handler do endpoint de upload |
| `apps/api/retrieve.ts` | modificado | Async + merge D1 com local |
| `apps/api/worker.ts` | modificado | Rota `/dataset/upload` + retrieve async |
| `packages/domain-retrieval/retrieve-local.ts` | modificado | `retrieveFromD1()` exportada |
| `apps/web/dataset-upload-api.ts` | criado | Cliente HTTP para upload |
| `apps/web/ui/components/DatasetManagerSheet.tsx` | criado | UI de 3 passos |
| `apps/web/app.tsx` | modificado | Botão "Datasets" + sheet |
| `packages/domain-retrieval/docs/ai-prompt-template.md` | criado | Prompt template para IA externa |

## Para ativar em staging

```bash
# 1. Criar banco D1 (se ainda não existir)
wrangler d1 create palm-map-staging

# 2. Rodar migrações
wrangler d1 execute palm-map-staging \
  --file=packages/domain-memory/migrations/001_session_state.sql --env staging
wrangler d1 execute palm-map-staging \
  --file=packages/domain-memory/migrations/002_document_chunks.sql --env staging

# 3. Descomentar [[env.staging.d1_databases]] em apps/api/wrangler.toml e preencher database_id
# 4. Redeploy: wrangler deploy --env staging
```

## Fora de escopo (futuro)

- Autenticação avançada por usuário/perfil (o gate atual valida somente token de sessão compartilhado)
- UI de listagem/remoção de datasets
- Integração com Vectorize/embeddings semânticos
- Rate limiting

## Atualização 2026-03-30

- O endpoint de upload segue público no sentido de não ter login, mas agora exige `X-Palm-Session-Token` validado no Worker contra `PALM_SESSION_TOKEN`.
- O Dataset Manager Web usa o mesmo TokenGate do app para enviar esse header em todas as chamadas.
