# apps/api

Responsabilidade: expor a camada HTTP do MVP e orquestrar chamadas para dominios e agentes.

Pertence aqui:
- endpoints do fluxo principal
- serializacao e validacao de payloads
- orquestracao entre dominios e montagem da resposta final minima

Nao pertence aqui:
- implementacao detalhada de regras de negocio
- fixtures de UI
- codigo de agenda complexa
- enriquecimento ou transformacao de dados alem do necessario para resposta

Dependencias esperadas:
- `packages/domain-trip`
- `packages/domain-memory`
- `packages/domain-retrieval`
- `packages/shared-types`

- contratos definidos em `packages/shared-types` sao a fonte de verdade da API

Proximos arquivos importantes:
- novos endpoints do fluxo principal
- validadores leves de request e response
- camada de orquestracao do MVP

Arquivos atuais:
- `plan-trip.ts`
- `index.ts`
- `worker.ts`
- `wrangler.toml`
- `package.json`

Como rodar localmente (Cloudflare Worker):
1. `cd apps/api`
2. `pnpm install`
3. `pnpm dev`

Endpoint local:
- `POST http://localhost:3001/plan-trip`
- compativel tambem com `POST http://localhost:3001/api/plan-trip` (usado pela UI atual)

Exemplos de teste rapido:

```bash
curl -sS -X POST http://localhost:3001/plan-trip \
  -H 'content-type: application/json' \
  -d '{"origin":"Fortaleza","destination":"Recife","days":3,"preferencesText":"praia"}'
```

```bash
curl -sS -X POST http://localhost:3001/plan-trip \
  -H 'content-type: application/json' \
  -d '{"origin":"Fortaleza","destination":"Recife","days":10}'
```

```bash
curl -sS -X POST http://localhost:3001/plan-trip \
  -H 'content-type: application/json' \
  -d '{"origin":"Fortaleza","destination":"Natal","days":3}'
```

Staging (Cloudflare):
- ambiente definido em `wrangler.toml` com `env.staging`
- deploy manual: `pnpm --dir apps/api deploy:staging`
- run local usando vars de staging: `pnpm --dir apps/api dev:staging`

Variaveis de staging atuais:
- `APP_ENV=staging`
- `API_ALLOWED_ORIGIN=*`
- placeholders para rollout futuro:
  - `D1_BINDING_NAME=PALM_MAP_DB`
  - `VECTORIZE_BINDING_NAME=PALM_MAP_INDEX`

Preparacao para D1 e Vectorize:
- placeholders de binding estao no `wrangler.toml` (comentados)
- quando recursos existirem, basta preencher:
  - `[[env.staging.d1_databases]]`
  - `[[env.staging.vectorize]]`

GitHub Actions (staging):
- workflow: `.github/workflows/deploy-staging-api.yml`
- aciona em push para `main` quando ha mudancas de API/dominios compartilhados
- tambem suporta disparo manual (`workflow_dispatch`)
- secrets necessarios:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
