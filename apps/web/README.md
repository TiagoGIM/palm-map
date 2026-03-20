# apps/web

Responsabilidade: hospedar a experiencia web mobile first do Palm Map.

Pertence aqui:
- telas do fluxo principal
- componentes de interface
- estados de carregamento, erro e validacao visual
- renderizacao fiel dos dados retornados pela API

Nao pertence aqui:
- regras centrais de planejamento
- logica de memoria
- heuristicas de retrieval

Dependencias esperadas:
- `packages/shared-types`
- contratos expostos por `apps/api`

Estrutura minima atual:
- `main.tsx`: ponto de entrada da app web e montagem do shell no `#root`
- `app.tsx`: shell pequeno do fluxo `plan-trip`, com formulario, submit e estados basicos
- `plan-trip-api.ts`: chamada HTTP para `POST /api/plan-trip`
- `plan-trip-result.tsx`: renderizacao do resultado retornado pela API
- `index.html`: host minimo da app no navegador com `<div id="root">`
- `vite.config.ts`: setup de dev server e proxy de `/api` para a API local
- `package.json`: scripts de execucao local (`dev`, `build`, `preview`)
- `wrangler.toml`: configuracao minima para deploy no Cloudflare Pages
- `.env.local.example`: variavel publica de API para local/staging
- `tailwind.config.ts`: mapeamento de tokens para utilitarios Tailwind
- `postcss.config.cjs`: pipeline minimo para Tailwind + autoprefixer
- `styles/tokens.css`: tokens de design (cores, tipografia, espacamento, radius, elevacao, motion)
- `styles/globals.css`: estilos globais e classes semanticas do fluxo atual
- `ui/primitives/*`: componentes base de interface (Button, Card, Input, Chip)
- `ui/navigation/*`: componentes de navegacao base (AppBar, BottomNav)
- `ui/overlays/*`: componentes de overlay base (Sheet)

Como evoluir:
- tarefas de entrada e estado do fluxo devem partir de `app.tsx`
- tarefas de integracao HTTP devem reutilizar `plan-trip-api.ts`
- tarefas de exibicao do roteiro devem ajustar `plan-trip-result.tsx`
- a UI deve continuar refletindo diretamente os dados da API, sem inferencias locais de negocio

Como rodar localmente:
1. `cd apps/web`
2. `pnpm install`
3. `pnpm dev`
4. abrir `http://localhost:5173`

Notas de execucao:
- sem `VITE_API_BASE_URL`, a UI usa `/api/plan-trip`
- no modo dev, o Vite faz proxy de `/api` para `http://localhost:3001`
- com `VITE_API_BASE_URL`, a UI chama `${VITE_API_BASE_URL}/plan-trip`
- hot reload (HMR) ativo no `pnpm dev` para alteracoes de componentes/estilos

Staging (Cloudflare Pages):
- build/deploy do web preparado para Pages
- script local de deploy preview/staging: `pnpm --dir apps/web deploy:preview`
- workflow CI: `.github/workflows/deploy-staging-web.yml`

Variavel publica de ambiente:
- `VITE_API_BASE_URL`: base publica da API (ex: Worker staging)
- em staging, deve apontar para a API publica de staging

Como validar local e staging:
1. Local com API local:
   - manter `VITE_API_BASE_URL` vazio (ou ausente)
   - subir API: `pnpm --dir apps/api dev`
   - subir web: `pnpm --dir apps/web dev`
2. Local web contra API staging:
   - criar `apps/web/.env.local` com `VITE_API_BASE_URL=<url-da-api-staging>`
   - subir web: `pnpm --dir apps/web dev`
3. Deploy staging no CI:
   - configurar secrets:
     - `CLOUDFLARE_API_TOKEN`
     - `CLOUDFLARE_ACCOUNT_ID`
     - `CLOUDFLARE_PAGES_PROJECT_STAGING`
     - `STAGING_API_BASE_URL`
   - acionar workflow `Deploy Web Staging`

Modelo de estilos inicial (MVP):
- guideline visual: Material Design (principios), sem framework pesado de componentes
- implementacao: Tailwind CSS + tokens em CSS variables
- foco: mobile first, leveza, consistencia e evolucao incremental

Principios adotados agora:
- superficies e hierarquia visual simples (App shell, cards, avisos)
- escala tipografica e espacamento previsiveis por tokens
- estados visuais basicos (erro, warning, disabled)
- elevacao minima por niveis (`--elevation-1`, `--elevation-2`)

Fica para depois:
- sistema completo de temas dinamicos
- bibliotecas de componentes completas
- componentes complexos de alto acoplamento

Regras de implementacao:
- usar utilitario Tailwind para layout/composicao local
- usar classe semantica para padroes recorrentes de tela
- criar componente quando houver reuso com comportamento/semantica
- evitar estilo solto fora de tokens, classes base e componentes

Plano incremental de adocao:
1. manter telas atuais usando `styles/globals.css` + tokens
2. migrar novos trechos para primitives (`ui/primitives`)
3. consolidar navegacao mobile com `AppBar`/`BottomNav` quando necessario
4. usar `Sheet` para interacoes secundarias sem redesenhar fluxo principal
