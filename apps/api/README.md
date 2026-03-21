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

Para preparar o artefato local de retrieval (Recife v1) antes do teste de `/retrieve`:
1. `cd /repo-root`
2. `node packages/domain-retrieval/scripts/ingest-recife-v1.mjs`

Endpoint local:
- `POST http://localhost:3001/plan-trip`
- compativel tambem com `POST http://localhost:3001/api/plan-trip` (usado pela UI atual)
- `POST http://localhost:3001/conversation/update`
- compativel tambem com `POST http://localhost:3001/api/conversation/update`
- `POST http://localhost:3001/retrieve`
- compativel tambem com `POST http://localhost:3001/api/retrieve`

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

```bash
curl -sS -X POST http://localhost:3001/retrieve \
  -H 'content-type: application/json' \
  -d '{"query":"museu e historia","city":"Recife","topK":3}'
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
  },
  "tripLegs": [
    { "fromCity": "Fortaleza", "toCity": "Recife", "order": 1 }
  ]
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

`/retrieve` (RAG local minimo):
- entrada: `query`, `city`, `topK` (opcional)
- usa artefato local gerado por ingest (`packages/domain-retrieval/artifacts/recife-v1.chunks.*`)
- escopo inicial: somente dataset Recife v1

Exemplo de resposta:

```json
{
  "query": "museu e historia",
  "city": "Recife",
  "topK": 3,
  "results": [
    {
      "chunkId": "recife-attraction-instituto-ricardo-brennand-chunk-1",
      "docId": "recife-attraction-instituto-ricardo-brennand",
      "city": "Recife",
      "title": "Instituto Ricardo Brennand",
      "category": "attraction",
      "region": "Varzea",
      "summary": "Complexo cultural com museu, pinacoteca e area externa ampla.",
      "snippet": "Complexo cultural com museu...",
      "tags": ["museu", "arte", "historia"],
      "source": "manual:recife-v1",
      "updatedAt": "2026-03-20",
      "score": 1
    }
  ]
}
```

Consolidacao conversa + retrieval grounded:
- `assistantMessage`: texto resumido da resposta do assistente
- `nextQuestion`: somente quando ha pergunta real de slot/esclarecimento
- `groundedSuggestions`: sugestoes estruturadas e grounded por cidade

Exemplo (`o que vale visitar em Recife?`):

```json
{
  "tripState": { "destination": "Recife", "stops": [], "savedPlacesByCity": [], "preferences": { "likes": [], "dislikes": [] } },
  "assistantMessage": "Sugestoes grounded em Recife: 1. Instituto Ricardo Brennand (Varzea) | 2. Cais do Sertao (Recife Antigo) | 3. Recife Antigo (Centro).",
  "groundedSuggestions": {
    "city": "Recife",
    "query": "o que vale visitar em Recife?",
    "topK": 3,
    "items": [
      {
        "rank": 1,
        "city": "Recife",
        "region": "Varzea",
        "title": "Instituto Ricardo Brennand",
        "category": "attraction",
        "summary": "Complexo cultural com museu, pinacoteca e area externa ampla.",
        "source": "manual:recife-v1",
        "score": 1,
        "docId": "recife-attraction-instituto-ricardo-brennand",
        "chunkId": "recife-attraction-instituto-ricardo-brennand-chunk-1"
      }
    ]
  }
}
```

Exemplo (`me sugere cafes em Boa Viagem`):
- mapeia `city=Recife` e `regionHint=Boa Viagem` para melhorar ranking.

Exemplo (`salva a primeira opcao`):
- usa `tripState.conversationMeta.lastSuggestions` recente
- salva em `savedPlacesByCity` com `source: "retrieval"`.

Exemplo (`me mostra o que eu salvei em Recife`):
- retorna listagem em `assistantMessage`.

Quando retrieval nao encontra resultado:
- resposta segura em `assistantMessage`
- sem invencao de lugares.

Logs de debug (`CONVERSATION_UPDATE_DEBUG=true`):
- `retrieval_triggered`
- `retrieval_skipped_no_city`
- `retrieval_empty`
- `retrieval_suggestions_returned`
- `saved_from_suggestion`

Checklist operacional (conversa + retrieval):
- [x] retrieval acionado por intencao explicita de sugestao
- [x] `assistantMessage` separado de `nextQuestion`
- [x] `groundedSuggestions` estruturado no response
- [x] mapeamento `Boa Viagem -> city Recife + regionHint Boa Viagem`
- [x] `salva a primeira opcao` a partir de sugestoes recentes
- [x] stale guard via `conversationMeta.lastSuggestionsAt`
- [x] fallback seguro sem invencao quando retrieval vazio

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
  },
  "tripLegs": [
    { "fromCity": "Natal", "toCity": "Recife", "order": 1 },
    { "fromCity": "Recife", "toCity": "Aracaju", "order": 2 }
  ]
}
```

Visao por trecho (`tripLegs`):
- derivada de `origin -> stops -> destination`
- sem persistencia separada nesta fase
- `order` acompanha a ordem da rota
- `stayDaysAtDestination` aparece apenas quando explicito no destino do trecho

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
  - `tripState.conversationMeta.lastResolvedField`
  - `tripState.conversationMeta.lastUserMessage`
  - `tripState.conversationMeta.conversationStage`
  - `tripState.conversationMeta.unresolvedFields`
  - `tripState.conversationMeta.confidenceByField` (opcional)
  - `tripState.conversationMeta.currentFocusCity`
  - `tripState.conversationMeta.currentFocusField`

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

Correcao de slot `daysTotal` (turno contextual):
- quando a pergunta anterior foi `Quantos dias...`, respostas diretas agora tem prioridade:
  - `7 dias`
  - `vou passar 7 dias`
  - `serao 5 dias`
- o valor e persistido em `tripState.daysTotal`
- `nextQuestion` e recalculada apos o merge final e nao repete `daysTotal` se o slot foi preenchido

Resolucao contextual de lugar (minima):
- referencias como `la`, `ali`, `nesse destino`, `nessa parada` usam foco atual da conversa
- fallback de foco:
  - stop em foco (se houver stop recente)
  - destino atual (quando nao houver stop ativo)
- exemplos:
  - `quero viajar de Sao Vicente para Sao Miguel` -> cidades limpas
  - depois: `pretendo passar 4 dias la` -> aplica no destino/foco atual
  - `quero ficar 2 dias nessa parada` -> aplica no stop em foco quando houver

Nucleo conversacional (pipeline modular):
- `extractConversationSignals`
- `normalizeEntities`
- `resolveContextualReferences`
- `mergeTripState`
- `decideNextAction`

Regra operacional:
- `nextQuestion` e decidida somente apos o merge final do estado
- logs por etapa disponiveis com `CONVERSATION_UPDATE_DEBUG=true`

Lugares salvos por cidade (`savedPlacesByCity`):
- estado agora guarda lugares salvos por cidade no proprio `TripState`
- estrutura minima por item:
  - `placeName`
  - `note` (opcional)
  - `source: "user"`

Exemplos:

```bash
curl -sS -X POST http://localhost:3001/conversation/update \
  -H 'content-type: application/json' \
  -d '{"message":"quero salvar o Mercado de Sao Jose em Recife","tripState":{"origin":"Natal","destination":"Recife","stops":[],"savedPlacesByCity":[],"preferences":{"likes":[],"dislikes":[]}}}'
```

```bash
curl -sS -X POST http://localhost:3001/conversation/update \
  -H 'content-type: application/json' \
  -d '{"message":"adiciona o Instituto Ricardo Brennand no roteiro","tripState":{"origin":"Natal","destination":"Recife","stops":[],"savedPlacesByCity":[],"preferences":{"likes":[],"dislikes":[]},"conversationMeta":{"currentFocusCity":"Recife","currentFocusField":"destination"}}}'
```

```bash
curl -sS -X POST http://localhost:3001/conversation/update \
  -H 'content-type: application/json' \
  -d '{"message":"remove o Mercado de Sao Jose da minha lista","tripState":{"origin":"Natal","destination":"Recife","stops":[],"savedPlacesByCity":[{"city":"Recife","places":[{"placeName":"Mercado de Sao Jose","source":"user"},{"placeName":"Instituto Ricardo Brennand","source":"user"}]}],"preferences":{"likes":[],"dislikes":[]},"conversationMeta":{"currentFocusCity":"Recife","currentFocusField":"destination"}}}'
```

```bash
curl -sS -X POST http://localhost:3001/conversation/update \
  -H 'content-type: application/json' \
  -d '{"message":"quais lugares eu salvei em Recife?","tripState":{"origin":"Natal","destination":"Recife","stops":[],"savedPlacesByCity":[{"city":"Recife","places":[{"placeName":"Instituto Ricardo Brennand","source":"user"}]}],"preferences":{"likes":[],"dislikes":[]},"conversationMeta":{"currentFocusCity":"Recife","currentFocusField":"destination"}}}'
```

Quando faltar cidade/contexto suficiente para salvar/remover:
- API retorna `nextQuestion` pedindo cidade: `Em qual cidade fica esse lugar?`

Quando pedir listagem com cidade resolvida:
- API retorna a resposta textual no `nextQuestion`:
  - `Lugares salvos em Recife: Instituto Ricardo Brennand.`

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
