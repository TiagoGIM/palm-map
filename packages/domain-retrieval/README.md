# domain-retrieval

Responsabilidade: recuperar fatos e opcoes confiaveis para apoiar o planejamento.

Pertence aqui:
- contratos de resultado grounded
- ranking simples de confianca
- fixtures e mocks de retrieval

Nao pertence aqui:
- montagem final do roteiro
- logica de UI
- agenda e automacoes

Dependencias esperadas:
- `packages/shared-types`

Proximos arquivos importantes:
- tipos de resultado de retrieval
- adapter mock inicial
- criterios minimos de confianca

RAG local minimo (Recife v1):
- dataset: `datasets/recife-v1.documents.json`
- schema canonico: `schema/recife-v1-document.schema.json`
- ingest local: `scripts/ingest-recife-v1.mjs`
- artefato gerado: `artifacts/recife-v1.chunks.json` e `artifacts/recife-v1.chunks.ts`
- retrieval local: `retrieve-local.ts`

Como rodar ingest:

```bash
node packages/domain-retrieval/scripts/ingest-recife-v1.mjs
```

Saida esperada:
- validacao basica do schema por documento
- chunks gerados e serializados em artefato local inspecionavel
