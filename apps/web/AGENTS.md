# apps/web Instructions

- Priorize mobile first em layout, navegacao e estados vazios.
- Mantenha a UX simples e centrada no fluxo principal do MVP.
- Evite bibliotecas pesadas ou design system prematuro.

- Trate a UI como camada de orquestracao e apresentacao.
- Nao acople regras de negocio ou heuristicas de planejamento na interface.
- Nao duplicar validacoes ou regras ja existentes na API.

- A interface nao deve inventar ou completar dados ausentes.
- Deve refletir fielmente a resposta da API.

- Nao antecipar funcionalidades fora do fluxo principal do MVP.

- Sempre tratar estados vazios de forma explicita (sem dados, erro ou ausencia de resultados).

- Prefira componentes pequenos e estados previsiveis.
- Evitar estados complexos ou distribuicao excessiva de estado entre componentes.