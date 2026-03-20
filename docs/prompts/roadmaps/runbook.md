# Palm Map MVP Runbook

Este arquivo define a ordem de execucao das proximas tasks do MVP e as regras para o Codex seguir sem expandir escopo.

## Regras Gerais

- Execute as tasks em ordem.
- Nao iniciar a proxima task antes de concluir e validar a anterior.
- Ler apenas os arquivos relevantes para a task atual.
- Use `pnpm` como package manager padrao em todas as tasks (instalacao e execucao de scripts).
- Mantenha mudancas pequenas, locais e reversiveis.
- Nao expandir escopo por conta propria.
- Se houver ambiguidade, registrar no resumo da task em vez de ampliar a implementacao.
- Preservar:
  - grounding
  - separacao de dominios
  - baixo custo
  - simplicidade de manutencao

## Regra de Effort

- Use `low` por padrao.
- So usar `medium` quando a task exigir mudanca arquitetural real ou decisao entre multiplos caminhos validos.
- Nao usar `high` sem necessidade explicita.

## Como executar cada task

Para cada task:
1. Ler objetivo, escopo, restricoes e criterios de aceite.
2. Implementar apenas o necessario para aquela task.
3. Validar os criterios de aceite.
4. Produzir um resumo curto com:
   - Task concluida
   - Effort usado
   - Arquivos alterados
   - Criterios de aceite verificados
   - Limites temporarios
   - Proxima task recomendada
5. So depois seguir para a proxima.

---

## Task 1 — Tornar `apps/web` executavel no navegador

**Effort:** `low`

### Objetivo
Garantir que a UI atual possa rodar localmente no browser com o menor setup possivel.

### Escopo
- adicionar setup minimo executavel para `apps/web`
- garantir entrypoint com `main.tsx`
- garantir montagem em `#root`
- manter a estrutura atual da UI
- documentar como rodar localmente no README de `apps/web`

### Restricoes
- nao adicionar framework pesado
- nao adicionar routing complexo
- nao mudar logica de negocio
- manter setup minimo

### Criterios de Aceite
- existe um comando claro para subir a UI localmente
- a app abre no navegador
- o formulario aparece
- a UI continua apontando para a API atual
- README de `apps/web` explica como rodar

---

## Task 2 — Validar o fluxo completo pela UI

**Effort:** `low`

### Objetivo
Validar manualmente o MVP fim a fim pela interface.

### Escopo
- validar os 3 cenarios principais na UI:
  1. Recife / 3 dias
  2. Recife / 10 dias
  3. destino sem fixture
- registrar o resultado em nota curta de validacao

### Restricoes
- nao redesenhar a UI
- nao criar framework de testes pesado
- nao alterar logica salvo bug pequeno estritamente necessario

### Criterios de Aceite
- cenario 1 mostra resultado com dias preenchidos
- cenario 2 mostra warnings
- cenario 3 mostra erro explicito
- a UI exibe `effectivePreferencesText` quando presente
- existe registro curto da validacao em `tests/` ou `docs/`

---

## Task 3 — Melhorar a leitura do resultado na UI

**Effort:** `low`

### Objetivo
Deixar o roteiro mais facil de ler e validar visualmente.

### Escopo
- melhorar agrupamento visual por dia
- tornar warnings mais visiveis
- manter nota de preferencia efetiva discreta e clara
- preservar fluxo atual

### Restricoes
- nao redesenhar a aplicacao
- nao adicionar bibliotecas pesadas
- nao adicionar logica de negocio
- manter mobile first

### Criterios de Aceite
- dias estao claramente separados
- itens sao faceis de escanear
- warnings ficam visiveis
- preferencia efetiva continua visivel quando existir

---

## Task 4 — Consolidar memoria explicita minima no fluxo

**Effort:** `low`

### Objetivo
Fechar o primeiro loop de aprendizado simples do usuario no MVP.

### Escopo
- manter store temporario em memoria
- garantir que preferencias explicitas influenciem ranking
- garantir que requests futuros sem `preferencesText` possam reutilizar a ultima preferencia explicita
- preservar `effectivePreferencesText` como fonte de verdade

### Restricoes
- nao adicionar banco
- nao usar LLM
- nao inferir preferencias implicitas
- nao criar identidade de usuario complexa

### Criterios de Aceite
- request com preferencia altera a ordenacao
- request seguinte sem preferencia reutiliza a anterior
- UI mostra o valor retornado pela API
- comportamento continua simples, auditavel e temporario

---

## Task 5 — Adaptar a API para Cloudflare Worker local

**Effort:** `medium`

### Objetivo
Executar a borda da API no runtime alvo do projeto, mantendo dominio e contratos intactos.

### Escopo
- substituir servidor Node temporario por Worker local minimo
- expor `POST /plan-trip`
- manter CORS simples para desenvolvimento local
- documentar como rodar com Wrangler
- permitir teste via curl/Postman

### Restricoes
- nao mexer na logica de dominio
- nao adicionar framework
- nao introduzir automacao de deploy ainda
- manter implementacao minima e direta

### Criterios de Aceite
- `POST /plan-trip` funciona em runtime local de Worker
- os 3 cenarios principais continuam funcionando
- a UI pode consumir esse endpoint
- README da API documenta como rodar e testar

---

## Regra de bloqueio

Se uma task nao atender aos criterios de aceite:
- nao seguir para a proxima
- registrar claramente o que faltou
- propor o menor ajuste necessario
