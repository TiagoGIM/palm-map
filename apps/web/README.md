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
- `app.tsx`: shell conversacional minimo com mensagens, input livre e estado local de `TripState`
- `conversation-update-api.ts`: chamada HTTP para `POST /api/conversation/update`
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
- tarefas de integracao HTTP devem reutilizar `conversation-update-api.ts`
- tarefas de exibicao do roteiro devem ajustar `plan-trip-result.tsx`
- a UI deve continuar refletindo diretamente os dados da API, sem inferencias locais de negocio

Como rodar localmente:
1. `cd apps/web`
2. `pnpm install`
3. `pnpm dev`
4. abrir `http://localhost:5173`

Notas de execucao:
- sem `VITE_API_BASE_URL`, a UI usa `/api/conversation/update` (e `/api/plan-trip` segue disponivel)
- no modo dev, o Vite faz proxy de `/api` para `http://localhost:3001`
- com `VITE_API_BASE_URL`, a UI chama `${VITE_API_BASE_URL}/conversation/update`
- em ambiente publicado (Pages/staging/producao), `VITE_API_BASE_URL` e obrigatoria; sem ela, o app falha cedo para evitar chamadas erradas ao host estatico
- hot reload (HMR) ativo no `pnpm dev` para alteracoes de componentes/estilos
- o `vite.config.ts` usa polling (`server.watch.usePolling=true`) para evitar falhas de reload em alguns ambientes

Validacao rapida do fluxo conversacional:
1. subir API local: `pnpm --dir apps/api dev`
2. subir web: `pnpm --dir apps/web dev`
3. abrir `http://localhost:5173`
4. enviar mensagens como:
   - `Quero viajar de Natal para Aracaju por 8 dias`
   - `Passar por Recife`
   - `Quero ficar 2 dias em Maceio`
5. confirmar na UI:
   - mensagem do usuario
   - `assistantMessage` como texto principal da resposta
   - `nextQuestion` apenas quando houver pergunta real
   - `suggestedRoute` quando vier da API
   - `groundedSuggestions` com botoes de acao `Salvar opcao N`

Staging (Cloudflare Pages):
- build/deploy do web preparado para Pages
- URL de staging: `https://palm-map-web-staging.pages.dev`
- script local de deploy: `pnpm --dir apps/web deploy:staging`
- o script procura `VITE_API_BASE_URL` nesta ordem:
  - env do shell
  - `apps/web/.env.staging.local`
  - `apps/web/.env.local`
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
4. Deploy staging manual:
   - criar `apps/web/.env.staging.local` a partir de `apps/web/.env.staging.example`
   - preencher `VITE_API_BASE_URL` com a URL publica do Worker de staging
   - rodar `pnpm --dir apps/web deploy:staging`
   - o script bloqueia o deploy se a env estiver ausente ou invalida
   - apos o deploy, o app fica disponivel em `https://palm-map-web-staging.pages.dev`

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
