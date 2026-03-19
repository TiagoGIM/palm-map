# infra/cloudflare

Responsabilidade: concentrar a infraestrutura minima quando o projeto precisar de deploy e edge runtime compatibilizados com Cloudflare.

Pertence aqui:
- configuracoes de deploy
- notas de runtime e limites operacionais
- adaptadores de ambiente quando realmente necessarios

Nao pertence aqui:
- logica de dominio
- configuracao pesada prematura
- scripts de provider ainda nao usados

- Nao introduzir configuracoes de infraestrutura antes de haver necessidade real de deploy.
- Evitar otimizacoes de performance, caching ou edge routing neste estagio.
- Priorizar configuracoes simples, legiveis e de facil manutencao.
- Centralizar configuracoes de ambiente e evitar duplicacao entre apps.

Dependencias esperadas:
- `apps/web`
- `apps/api`

Proximos arquivos importantes:
- guia simples de deploy no Cloudflare
- definicao minima de variaveis de ambiente