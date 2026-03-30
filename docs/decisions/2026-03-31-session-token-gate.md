# Session Token Gate

**Data:** 2026-03-30
**Status:** Implementado

## Problema

O Palm Map é público, mas alguns ambientes (ex: staging) precisam de um controle mínimo de abertura. Sem um token, qualquer pessoa pode chamar o `conversation-update` e os demais endpoints, o que dificulta testes internos e dilui o feedback.

## Solução

1. O web app exibe um overlay full-screen (`TokenGate`) até que `localStorage` contenha `palm_map_session_token`. O token é salvo no navegador e pode ser trocado a qualquer momento via botão "Token" no `AppBar`.
2. Todos os clientes HTTP (`conversation-update`, `plan-trip`, `dataset-upload`) injetam `X-Palm-Session-Token` no cabeçalho; a ausência desse cabeçalho dispara um erro claro antes mesmo de a requisição atingir o backend.
3. O worker exige `X-Palm-Session-Token` para os routes principais, compara com o secret `PALM_SESSION_TOKEN` e responde erro JSON:
   - `401 session_token_missing` quando o header falta;
   - `401 session_token_invalid` quando o valor está errado;
   - `503 session_token_unconfigured` quando o ambiente não configurou o secret.
   O CORS permite `content-type` e `x-palm-session-token` para que o browser não bloqueie os requests.

## Critérios de sucesso

- O overlay impede interações quando nenhum token está presente.
- Todas as solicitações ao worker têm `X-Palm-Session-Token` e são rejeitadas quando o header estiver em falta ou inválido.
- Há um caminho claro para trocar o token (botão no AppBar e o próprio overlay).
- O documento explica o fluxo e pode ser referenciado ao configurar novos ambientes.

## Como gerar e divulgar o token

- Gere o token em um terminal seguro, por exemplo:
  ```bash
  openssl rand -hex 16
  ```
- Registre o valor nas secrets da Cloudflare:
  ```bash
  wrangler secret put PALM_SESSION_TOKEN --env staging
  ```
- Compartilhe o token apenas com o time autorizado (não exponha o valor no bundle do Pages), assim o `TokenGate` só funcionará quando alguém inseri-lo manualmente.
- Para rotacionar, repita os passos acima e peça aos times de QA/desenvolvimento que recarreguem a página para reabrir o gate.
