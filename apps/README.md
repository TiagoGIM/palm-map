# apps

Responsabilidade: concentrar as aplicacoes executaveis do projeto.

Pertence aqui:
- `web` para experiencia mobile first
- `api` para camada HTTP e orquestracao

Nao pertence aqui:
- regras de dominio compartilhadas
- tipos comuns reutilizaveis

- Aplicacoes nao devem conter logica de dominio.
- Toda regra deve residir em `packages/domain-*`.

- `web` consome `api`.
- `api` orquestra dominios em `packages/`.

- `web` nao deve acessar diretamente `packages/domain-*`.
- Toda comunicacao deve passar pela `api`.

- Manter as aplicacoes simples e focadas no fluxo principal do MVP.

Dependencias esperadas:
- `packages/*`

Proximos arquivos importantes:
- contratos de request/response entre `web` e `api`