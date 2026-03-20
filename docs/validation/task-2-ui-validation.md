# Task 2 - Validacao do fluxo completo pela UI

Data: 2026-03-20
Effort: low

## Cenarios validados

1. Recife / 3 dias
- Resultado com dias preenchidos.
- `effectivePreferencesText` presente quando enviado (`praia e comida local`).

2. Recife / 10 dias
- Resultado com dias preenchidos.
- Warning presente: `Not enough grounded places to fill all requested days.`

3. Destino sem fixture
- Erro explicito retornado: `No grounded fixtures found for destination "Natal".`

## Evidencias rapidas

- Build da UI concluido com sucesso (`pnpm --dir apps/web build`).
- A UI renderiza `warnings` no resultado quando presentes.
- A UI renderiza a nota de `effectivePreferencesText` quando presente.
- A UI renderiza erro explicito com `role="alert"` em falha de request.

## Limite temporario

- A validacao foi feita com execucao local e verificacao do fluxo via respostas reais do endpoint/handler e renderizacao da UI; sem automacao de browser end-to-end nesta task.
