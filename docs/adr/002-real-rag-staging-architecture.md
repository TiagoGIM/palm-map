# ADR 002: RAG Real, Infra de Staging e Stack Cloud-Cost-First

## Status

Accepted

## Contexto

A ADR 001 definiu a base do MVP com separação por domínios e tornou o retrieval grounded obrigatório antes do planner, no fluxo canônico:

`entrada -> memória -> retrieval -> planner -> resposta`

O projeto já validou o scaffold técnico inicial, mas ainda depende de fixtures e retrieval não real.

A próxima fase precisa:

- sair de scaffold para dataset real
- ter retrieval vetorial real
- expor um endpoint isolado para avaliação
- integrar retrieval ao `/plan-trip`
- preparar staging testável
- manter custo inicial o mais próximo possível de zero

Também queremos estruturar a base de CI/CD e runtime de forma compatível com free tiers, priorizando simplicidade operacional e baixo custo.

## Decisão

### 1. Runtime e deploy

- Usar **Cloudflare Workers** como runtime principal da API de staging
- Usar **Cloudflare Pages** para o app web
- Usar **GitHub Actions + Wrangler** para CI/CD de staging

### 2. Stack de dados do RAG

- Usar **Cloudflare Vectorize** como índice vetorial do MVP
- Usar **Cloudflare D1** para documentos normalizados, chunks e metadados
- Adiar **R2** até existir necessidade real de armazenar dumps brutos, snapshots ou artefatos grandes

### 3. Estratégia de embeddings

- **Não gerar embeddings no request do usuário**
- Gerar embeddings no pipeline de ingestão, localmente ou via job controlado de CI
- O runtime de staging deve apenas consultar o índice vetorial e hidratar metadados

Essa decisão reduz custo, latência e complexidade operacional.

### 4. Arquitetura operacional do fluxo

Fluxo alvo:

1. entrada do usuário
2. memória explícita mínima
3. retrieval real (`Vectorize + D1`)
4. planner
5. resposta final com evidências

O retrieval continua como **fonte de fatos**, e o planner continua como **organizador do roteiro**, preservando a ADR 001.

### 5. Endpoint isolado de retrieval

Criar endpoint dedicado:

- `POST /retrieve`

Input:
- `query`
- `city`
- `topK`

Output:
- chunks retornados
- score
- source
- metadados
- modo debug opcional

Esse endpoint deve existir antes da integração no `/plan-trip`.

### 6. Dataset inicial

Adotar um dataset real inicial de **Recife v1**, pequeno e versionado, com foco em validação prática.

Formato mínimo por documento:

- `id`
- `title`
- `category`
- `region`
- `summary`
- `content`
- `tags`
- `source`
- `updatedAt`

Meta inicial:

- **40 a 60 documentos** reais, suficientes para validar o RAG

### 7. Avaliação

Criar avaliação manual versionada com:

- 20 a 30 queries reais
- expected signals
- top results recuperados
- nota simples de relevância

A integração com `/plan-trip` só avança depois que o retrieval isolado mostrar qualidade mínima aceitável.

### 8. Ambientes

Definir dois ambientes explícitos:

- **local**: índice local simples para desenvolvimento rápido
- **staging**: Cloudflare Workers + D1 + Vectorize

O staging passa a ser o ambiente oficial de validação integrada do RAG.

## Consequências

- O projeto sai de scaffold para uma arquitetura testável em staging
- O retrieval deixa de depender de fixtures fechadas
- A equipe ganha um caminho de evolução compatível com free tier
- A separação retrieval/planner da ADR 001 é preservada e operacionalizada
- O pipeline de ingestão passa a ser parte explícita da arquitetura

## Trade-offs

- A stack fica mais acoplada à Cloudflare no MVP
- O pipeline de ingestão exige mais disciplina desde cedo
- O ambiente de staging deixa de ser apenas deploy do scaffold e passa a carregar infra mínima de dados
- Alguns limites de free tier podem exigir ajustes futuros em volume, frequência de ingestão ou avaliação automatizada

## Fora de escopo agora

- multi-cidade
- memória complexa
- embeddings em tempo real
- orchestrators RAG pesados
- banco alternativo só para vector search
- produção completa

## Relação com a ADR 001

Esta ADR **complementa** a ADR 001.

A ADR 001 continua definindo os princípios arquiteturais do MVP.
Esta ADR define a implementação concreta da fase de **RAG real + staging**.

## Tasks iniciais derivadas

1. Fechar infra base de staging
   - Worker de API
   - Pages do web
   - D1
   - Vectorize
   - GitHub Actions + Wrangler

2. Implementar ingest Recife v1
   - schema
   - normalização
   - chunking
   - embeddings
   - persistência em D1 + Vectorize

3. Subir `/retrieve` e avaliar
   - endpoint isolado
   - 20–30 queries
   - ajuste de topK/chunking
   - só depois integrar no `/plan-trip`