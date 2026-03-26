# Palm Map MVP Runbook

Este arquivo referencia o runbook operacional do MVP e fixa regras transversais.

## Regras Gerais

- Use `pnpm` como package manager padrao em todas as tasks (instalacao e execucao de scripts).
- Scripts TypeScript locais seguem o `tsconfig.node.json` compartilhado e devem ser executados com `TS_NODE_PROJECT=tsconfig.json node --loader ts-node/esm --experimental-specifier-resolution=node` (por exemplo o `apps/api` já usa `pnpm --dir apps/api test:plan-trip-validation`); evite renomear imports com `.ts`.
- Siga a ordem de tasks definida no runbook principal em `docs/prompts/roadmaps/runbook.md`.

## Documentação e rastreabilidade

- Sempre que uma task alterar fluxos conversacionais, normalização de lugares ou o uso de `TripState`, atualize a seção relevante em `apps/api/README.md` (por exemplo, explicando como `savedPlacesByCity` impacta o plano e quais correções geográficas foram adicionadas).
