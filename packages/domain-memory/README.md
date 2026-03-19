# domain-memory

Responsabilidade: representar e persistir memoria simples do usuario para o MVP.

Pertence aqui:
- preferencias declaradas
- normalizacao basica de sinais do usuario
- contratos de leitura e atualizacao de memoria

Nao pertence aqui:
- historico conversacional complexo
- telemetria de interface
- regras de planejamento de roteiro

Dependencias esperadas:
- `packages/shared-types`

Proximos arquivos importantes:
- schema inicial de preferencias
- servico de merge de preferencias
- fixtures de memoria simples