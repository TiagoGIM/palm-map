# Secrets & Variáveis de ambiente exigidas pelo CI

Este repositório usa workflows do GitHub Actions para subir o site (Pages) e o worker (Cloudflare Workers). Antes de rodar o CI, crie os seguintes secrets em **Settings > Secrets and variables > Actions** do repositório:

| Nome | Onde é usado | Detalhes | Como gerar |
|------|--------------|----------|------------|
| `CLOUDFLARE_API_TOKEN` | Deploy de Workers e Pages | Token da Cloudflare com escopo mínimo de `Workers Scripts: Edit` e `Pages: Edit` | Cloudflare dashboard > My Profile > API Tokens > Create Token > use o template “Edit Cloudflare Workers”, ajuste os scopes e copie o valor gerado. |
| `CLOUDFLARE_ACCOUNT_ID` | `wrangler` CLI | ID da conta Cloudflare usada pelos deploys | Dashboard da conta (perfil/overview). |
| `CLOUDFLARE_PAGES_PROJECT_STAGING` | Deploy Pages staging | Nome do projeto Pages usado pelo workflow | Projeto criado no Cloudflare Pages > configurações > Project name. |
| `STAGING_API_BASE_URL` | `VITE_API_BASE_URL` no build web | URL pública (ex: `https://palm-map-api-staging.workers.dev`) apontando para o worker de staging | Copie a URL gerada depois de subir o worker de staging. |

## Como gerar o token `CLOUDFLARE_API_TOKEN`

1. Acesse https://dash.cloudflare.com e faça login.  
2. Vá em **My Profile > API Tokens** e clique em **Create Token**.  
3. Escolha o template **Edit Cloudflare Workers** e mantenha `Workers Scripts:Edit` plus `Pages:Edit` para a conta correta; restrinja zonas apenas se necessário.  
4. Depois de criar, copie o token (ele aparece só uma vez).  
5. No GitHub, cole o valor no secret `CLOUDFLARE_API_TOKEN`.  
6. Para os demais secrets (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_PROJECT_STAGING`, `STAGING_API_BASE_URL`), colete os valores da dashboard (IDs/nomes e URLs) e salve cada um como um secret distinto.

Com esses secrets preenchidos, os workflows `deploy-staging-web.yml` e `deploy-staging-api.yml` conseguem rodar o build e o deploy automaticamente.
