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
- `conversation-update.ts`
- `conversation-llm-adapter.ts`
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
- `POST http://localhost:3001/conversation/update`
- compativel tambem com `POST http://localhost:3001/api/conversation/update`

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

```bash
curl -sS -X POST http://localhost:3001/conversation/update \
  -H 'content-type: application/json' \
  -d '{"message":"Quero viajar de Fortaleza para Recife por 5 dias. Gosto de praia e nao curto balada."}'
```

Exemplo de resposta conversacional:

```json
{
  "tripState": {
    "origin": "Fortaleza",
    "destination": "Recife",
    "daysTotal": 5,
    "stops": [],
    "preferences": {
      "likes": ["praia"],
      "dislikes": ["balada"]
    }
  },
  "suggestedRoute": {
    "nodes": [
      { "city": "Fortaleza", "role": "origin" },
      { "city": "Recife", "role": "destination" }
    ],
    "daysTotal": 5
  }
}
```

Quando faltar informacao minima, a API retorna `nextQuestion`:

```json
{
  "tripState": {
    "destination": "Recife",
    "stops": [],
    "preferences": { "likes": [], "dislikes": [] }
  },
  "nextQuestion": "De qual cidade voce vai sair?"
}
```

Exemplo sem `daysTotal` (rota inicial ainda assim):

```bash
curl -sS -X POST http://localhost:3001/conversation/update \
  -H 'content-type: application/json' \
  -d '{"message":"Vou sair de Natal, passar por Recife e depois seguir para Aracaju"}'
```

```json
{
  "tripState": {
    "origin": "Natal",
    "destination": "Aracaju",
    "stops": [{ "city": "Recife" }],
    "preferences": { "likes": [], "dislikes": [] }
  },
  "nextQuestion": "Quantos dias voce quer para essa viagem?",
  "suggestedRoute": {
    "nodes": [
      { "city": "Natal", "role": "origin" },
      { "city": "Recife", "role": "stop" },
      { "city": "Aracaju", "role": "destination" }
    ]
  }
}
```

Exemplo de update incremental de `stayDays`:

```bash
curl -sS -X POST http://localhost:3001/conversation/update \
  -H 'content-type: application/json' \
  -d '{"message":"Quero ficar 3 dias em Recife e 2 dias em Maceio no caminho","tripState":{"origin":"Natal","destination":"Aracaju","daysTotal":8,"stops":[{"city":"Recife"},{"city":"Maceio"}],"preferences":{"likes":[],"dislikes":[]}}}'
```

Exemplo de append explicito de stop:

```bash
curl -sS -X POST http://localhost:3001/conversation/update \
  -H 'content-type: application/json' \
  -d '{"message":"Adiciona Joao Pessoa ao roteiro","tripState":{"origin":"Natal","destination":"Aracaju","daysTotal":8,"stops":[{"city":"Recife"}],"preferences":{"likes":[],"dislikes":[]}}}'
```

Exemplo de resposta curta contextual (origem faltante):

```bash
curl -sS -X POST http://localhost:3001/conversation/update \
  -H 'content-type: application/json' \
  -d '{"message":"Natal","tripState":{"destination":"Aracaju","stops":[],"preferences":{"likes":[],"dislikes":[]}}}'
```

Esperado:
- preencher `origin` com `Natal`
- nao repetir `De qual cidade voce vai sair?`

Exemplo de normalizacao de lugar:

```bash
curl -sS -X POST http://localhost:3001/conversation/update \
  -H 'content-type: application/json' \
  -d '{"message":"eu quero viajar de pipa a natal em 3 dias"}'
```

Esperado:
- `origin: "Pipa"` (tambem aceita `Praia de Pipa` e `Pipa/RN` como entrada)
- `destination: "Natal"`
- `daysTotal: 3`

Melhorias de nextQuestion (slot-filling com prioridade):
- prioridade de slots: `origin` -> `destination` -> `stop_stay_days` -> `daysTotal`
- evita repetir a mesma pergunta no turno seguinte quando houve resposta plausivel/progresso
- pode nao perguntar nada no turno quando ja houve progresso suficiente
- metadado curto no estado:
  - `tripState.conversationMeta.lastAskedField`
  - `tripState.conversationMeta.askedFieldsRecent`
  - `tripState.conversationMeta.lastUserTurn`

Exemplo antes/depois (resumo):
- antes:
  - user: `quero viajar de pipa a natal`
  - bot: `Quantos dias...?`
  - user: `Natal`
  - bot: `Quantos dias...?` (repetia cedo/demais)
- depois:
  - user: `quero viajar de pipa a natal`
  - bot: pode registrar progresso sem perguntar imediatamente
  - user: `Natal`
  - bot: nao repete origem, segue para gap mais util quando necessario

Extracao estruturada com LLM (opcional):
- quando `CONVERSATION_LLM_ENABLED=true`, a LLM vira caminho principal de extracao estruturada
- a saida da LLM e validada por schema estrito antes de aplicar no estado
- fallback heuristico e usado apenas quando a LLM falha/invalida/baixa confianca
- campos esperados da extracao: `origin`, `destination`, `daysTotal`, `stops`, `likes`, `dislikes`, `pace`, `budget`, `possibleMissingField`, `nextQuestion`

Variaveis de configuracao LLM:
- `CONVERSATION_LLM_ENABLED=true|false`
- `CONVERSATION_LLM_API_KEY=<token>` (necessaria para uso real da LLM)
- `CONVERSATION_LLM_BASE_URL=https://api.openai.com/v1`
- `CONVERSATION_LLM_MODEL=gpt-4.1-mini`
- `CONVERSATION_LLM_TIMEOUT_MS=5000`
- `CONVERSATION_LLM_MIN_CONFIDENCE=0.45`
- `CONVERSATION_LLM_DEBUG=true|false` (logs de modo LLM/fallback)
- `CONVERSATION_UPDATE_DEBUG=true|false` (logs de before/missingField/message/after)

Como observar uso de LLM vs fallback:
- com `CONVERSATION_LLM_DEBUG=true`, a API escreve logs como:
  - `[conversation-update] llm_used`
  - `[conversation-update] fallback_used reason=<motivo>`
  - `[conversation-update] validation_failed reason=<motivo>`
- motivos comuns: `llm_disabled`, `missing_api_key`, `invalid_llm_json`, `llm_schema_validation_failed`, `low_confidence`

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
