# tests

Responsabilidade: centralizar testes integrados, fixtures compartilhadas e estrategias de verificacao do MVP.

Pertence aqui:
- testes de fluxo principal
- fixtures de ponta a ponta
- suites de contrato entre app e dominios

Nao pertence aqui:
- testes internos muito acoplados a um pacote especifico
- snapshots sem valor de manutencao

- Testar comportamento observavel, nao detalhes internos de implementacao.
- Priorizar testes do fluxo principal em vez de cobertura ampla.

- Prefira mocks e fixtures simples e previsiveis.
- Evite fixtures complexas ou dificeis de manter.

- Validar contratos entre web, api e dominios como prioridade.

- Evitar testes excessivamente rigidos que dificultem mudancas no MVP.

Dependencias esperadas:
- `apps/api`
- `apps/web`
- `packages/domain-*`
- `packages/shared-types`

Proximos arquivos importantes:
- cenarios do fluxo `plan-trip`
- fixtures grounded do MVP