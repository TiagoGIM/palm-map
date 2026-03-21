# Palm Map Conversational MVP

## 1) Product direction

O proximo MVP deixa de ser centrado em um formulario fixo (`/plan-trip`) e passa a ser centrado em conversa.

Mudanca de foco:
- antes: o usuario preenche campos e recebe um roteiro por dias.
- agora: o usuario descreve a viagem em linguagem natural e o sistema atualiza um estado vivo da viagem.

Objetivo pratico:
- reduzir friccao de entrada.
- manter grounding e baixo custo.
- evoluir para copiloto de viagem sem depender de um unico endpoint rigido.

## 2) Central entity

`TripState` passa a ser a entidade central do MVP conversacional.

Regra:
- toda resposta do sistema deve ler e/ou atualizar `TripState`.
- qualquer proposta de rota, parada ou pergunta deve ser derivada do estado atual.

## 3) Minimum viable state model

Modelo minimo proposto (somente o necessario agora):

```ts
type TripState = {
  tripId: string
  status: 'collecting' | 'ready_to_suggest' | 'suggesting'
  origin?: string
  destination?: string
  startDate?: string
  endDate?: string
  days?: number
  stops: TripStop[]
  memory: UserPreferenceMemory
  missingFields: Array<'origin' | 'destination' | 'dates_or_days'>
  updatedAt: string
}

type TripStop = {
  city: string
  order: number
  nights?: number
  source?: 'user' | 'agent'
}

type UserPreferenceMemory = {
  explicitText?: string
  tags: string[]
  updatedAt?: string
}
```

Notas MVP:
- `stops` pode iniciar vazio.
- `tags` sao simples (ex: `praia`, `museu`, `economico`), sem ontologia complexa.
- sem modelagem de agenda detalhada nesta fase.

## 4) What the agent does

O agente deve:
- extrair do texto do usuario: origem, destino, datas/duracao, preferencias explicitas e paradas mencionadas.
- atualizar `TripState` de forma incremental.
- perguntar apenas o proximo dado necessario para continuar.
- sugerir estrutura inicial de rota/paradas quando `TripState` estiver minimamente completo.

O agente nao deve:
- assumir datas, cidades ou duracoes nao informadas.
- inventar lugares/eventos sem suporte grounded quando entrar em modo sugestao.
- inferir memoria implicita profunda (somente preferencias explicitas no MVP).

## 5) MVP conversation flow

Fluxo minimo:
1. Usuario escreve intencao livre (ex: "quero ir de Fortaleza para Recife no feriado e gosto de praia").
2. Sistema extrai campos e atualiza `TripState` parcial.
3. Sistema identifica `missingFields`.
4. Sistema faz apenas a proxima pergunta necessaria.
5. Usuario responde; sistema atualiza `TripState`.
6. Quando minimo completo (`origin`, `destination` e `dates_or_days`), sistema entra em `ready_to_suggest`.
7. Sistema comeca a propor estrutura de rota/paradas e refinamentos.

## 6) Scope boundaries

Dentro do escopo deste conversational MVP:
- captura de intencao em linguagem natural.
- atualizacao incremental de `TripState`.
- perguntas de desambiguacao minimas.
- sugestoes iniciais de rota/paradas com base no estado atual.
- memoria explicita simples de preferencias.

Fora do escopo agora:
- sistema completo de agenda.
- tracking rico de humor/estado emocional.
- otimizacao de hospedagem.
- replanning em tempo real durante a viagem.
- operacoes avancadas de viagem (tickets, check-in, automacoes complexas).
- retrieval real com ingestao/dataset de producao.

## 7) Relationship to retrieval

Retrieval continua importante, mas nao e o centro do produto.

Papel no novo MVP:
- apoiar validacao e sugestao de cidades, paradas e lugares salvos.
- fornecer fatos grounded para evitar alucinacao na fase de sugestoes.

Regra:
- conversa e `TripState` dirigem o fluxo.
- retrieval entra como capacidade de suporte quando houver dados minimos para buscar opcoes.

## 8) Phased execution recommendation

### Phase 1: conversation + Trip State
- entrada livre em texto.
- extracao de campos minimos.
- atualizacao de `TripState` e `missingFields`.
- perguntas minimas de complemento.

### Phase 2: stops/legs/saved places
- introduzir `TripStop` de forma utilitaria.
- permitir salvar/editar paradas no estado.
- ligar retrieval como suporte para sugestoes de paradas/lugares.

### Phase 3: richer planning, timeline, signals
- enriquecer sugestoes por sequencia temporal simples.
- incluir sinais adicionais do usuario (sem overmodeling).
- preparar terreno para evolucao de planner e memoria sem quebrar o nucleo conversacional.
