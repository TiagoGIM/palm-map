# infra

Responsabilidade: reservar a organizacao de infraestrutura do projeto sem antecipar setup complexo.

Pertence aqui:
- configuracoes de deploy
- notas de runtime
- adaptacoes minimas por ambiente

Nao pertence aqui:
- logica de negocio
- configuracao pesada antes da hora

Dependencias esperadas:
- `apps/web`
- `apps/api`

Proximos arquivos importantes:
- bootstrap de deploy compativel com Cloudflare
