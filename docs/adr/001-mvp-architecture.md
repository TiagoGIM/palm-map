# ADR 001: MVP Architecture

## Status

Accepted

## Contexto

O MVP precisa ser barato, mobile first e confiavel o bastante para nao inventar lugares ou roteiros. Ao mesmo tempo, o repositorio deve facilitar futuros jobs do Codex sem exigir uma base excessivamente complexa desde o inicio.

## Decisao

- Separar o sistema por dominios para isolar responsabilidades de planejamento, memoria, retrieval e agenda.
- Usar `AGENTS.md` em niveis global e local para orientar futuras mudancas sem depender de contexto oral.
- Definir subagents por papel para dividir trabalho operacional entre UI, API, retrieval e documentacao.
- Manter agenda simplificada e desacoplada no MVP.
- Tornar retrieval grounded obrigatorio para qualquer dado consumido pelo planner.

- Adotar um fluxo canonico de execucao:
  1. entrada do usuario
  2. memoria (preferencias)
  3. retrieval grounded
  4. planner
  5. resposta final

- Separar claramente:
  - retrieval como fonte de fatos
  - planner como organizador do roteiro

- Usar contratos em `packages/shared-types` como fonte de verdade para comunicacao entre modulos.

## Consequencias

- O repositorio ganha clareza para evolucao incremental.
- O planner fica protegido contra dependencias informais e dados inventados.
- O time pode executar tarefas futuras com menos ambiguidade no Codex.
- Parte da velocidade inicial e trocada por disciplina de contratos e separacao de responsabilidades, reduzindo retrabalho futuro.

## Trade-offs

- Menor velocidade inicial de desenvolvimento.
- Maior necessidade de disciplina na definicao de contratos.
- Complexidade ligeiramente maior na estrutura do repositorio em troca de previsibilidade futura.