# Palm Map

Palm Map e um webapp mobile first para planejamento de viagens com foco em baixo custo, grounding e aprendizado gradual de preferencias do usuario. O MVP v1 deve gerar roteiros validos a partir de origem, destino e duracao da viagem, sem inventar lugares, eventos ou combinacoes inexistentes.

## Visao Geral

O produto atua como um copiloto de viagens:
- recebe dados basicos da viagem
- consulta fontes grounded para recuperar opcoes confiaveis
- monta um roteiro por dias
- aprende preferencias explicitas do usuario
- prepara a base para acompanhamento continuo no futuro

## Objetivo do MVP

Entregar um fluxo simples que gere um roteiro validado, baseado em preferencias do usuario, com experiencia mobile first e custo operacional baixo.

## Fluxo Canonico do MVP

1. o usuario informa origem, destino e duracao da viagem
2. o `orchestrator` recebe a entrada e coordena memoria, retrieval e planejamento
3. o `retrieval` retorna opcoes grounded com `source` e `confidence`
4. o `planner-agent` monta o roteiro por dias sem inventar dados, lugares ou eventos
5. o sistema responde com um `TripPlan` simples, com dias organizados e referencias utilizadas

## Dominios do Sistema

- `trip-planning`: regras de construcao e organizacao do roteiro
- `memory`: preferencias e sinais persistentes do usuario
- `retrieval`: busca grounded com `source` e `confidence`
- `agenda`: contrato futuro para compromissos, desacoplado do MVP

## Agentes do Produto

- `orchestrator`: coordena o fluxo entre entrada, memoria, retrieval e planejamento
- `profile-agent`: extrai e atualiza preferencias explicitas do usuario
- `planner-agent`: monta o roteiro apenas com dados grounded
- `retrieval-agent`: retorna fatos, locais e referencias com origem e confianca

## Estrategia de Baixo Custo

- privilegiar mocks e fixtures antes de integracoes reais
- manter memoria inicial simples e orientada a preferencias explicitas
- evitar dependencias pesadas e infraestrutura prematura
- tratar agenda como modulo separado e adiado no MVP
- usar uma stack leve, compativel com Cloudflare, sem acoplar o repositorio a setup complexo

Se precisarmos fixar uma stack depois, uma composicao simples com web leve, API HTTP enxuta e pacotes compartilhados em TypeScript e um bom caminho, mas isso ainda nao bloqueia o bootstrap.

## Package Manager

- package manager padrao do repositorio: `pnpm`
- para instalar dependencias e rodar scripts, prefira `pnpm` em vez de `npm`

## Estrutura de Pastas

```text
palm-map/
  .codex/agents/
  apps/
    web/
    api/
  packages/
    domain-trip/
    domain-memory/
    domain-retrieval/
    domain-agenda/
    shared-types/
    shared-utils/
  agents/
    orchestrator/
    profile-agent/
    planner-agent/
    retrieval-agent/
  docs/
    product/
    adr/
    prompts/
  infra/
    cloudflare/
  tests/
```

## Contratos Basicos (visao simplificada)

```ts
type TripRequest = {
  origin: string
  destination: string
  days: number
  preferences?: string[]
}

type PlaceCandidate = {
  name: string
  source: string
  confidence: number
  notes?: string
}

type DayPlan = {
  day: number
  places: PlaceCandidate[]
  summary?: string
}

type TripPlan = {
  request: TripRequest
  days: DayPlan[]
}
```

## Regras Criticas

- nao inventar lugares, eventos ou combinacoes inexistentes
- o `planner-agent` nao cria dados novos; apenas organiza o que veio do retrieval
- toda informacao usada no roteiro deve vir do retrieval com `source` e `confidence`

## Principios de Desenvolvimento com Codex

- manter tarefas pequenas e escopo enxuto
- evitar mudancas globais e preferir mudancas locais
- preferir mocks e fixtures antes de integracoes reais
- respeitar fronteiras de dominio
- atualizar docs e contratos junto com mudancas estruturais
- usar `AGENTS.md` para contexto operacional antes de implementar
- usar subagents por papel quando o trabalho puder ser isolado

## Papel de README, AGENTS e .codex/agents

- `README.md`: visao global do produto, fluxo do MVP e mapa do repositorio
- `AGENTS.md`: regras operacionais e limites de implementacao
- `README.md` local: responsabilidade da area e arquivos importantes
- `AGENTS.md` local: instrucoes especificas da pasta afetada
- `.codex/agents/`: prompts e playbooks reutilizaveis para tarefas recorrentes

## Como Usar Este Repositorio com AGENTS.md e Subagents

1. ler este `README.md`
2. ler [docs/product/mvp.md](docs/product/mvp.md)
3. entrar no escopo do ticket e abrir o `AGENTS.md` local da area afetada
4. usar subagents em `.codex/agents/` quando a tarefa for claramente separavel por papel
5. registrar decisoes arquiteturais em `docs/adr/` quando a estrutura mudar

## Fora de Escopo do MVP

- integracoes externas reais
- agenda automatica
- recomendacoes em tempo real
- memoria complexa ou baseada em historico profundo
- otimizacao avancada de roteiros

## Roadmap Inicial

- definir contratos minimos entre `apps/api` e `packages`
- implementar fluxo basico mobile first de entrada da viagem
- criar mocks grounded para retrieval
- gerar roteiro por dias com validacao de entradas
- persistir preferencias explicitas simples do usuario

## Proximos Passos Recomendados

- formalizar payloads iniciais em `packages/shared-types`
- desenhar o contrato do fluxo `plan-trip`
- criar fixtures de retrieval com `source` e `confidence`
- montar um esqueleto de UI mobile first em `apps/web`
- expor um endpoint pequeno na `apps/api` para orquestrar o MVP
