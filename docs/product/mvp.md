# Palm Map MVP v1

## Problema

Planejar viagens costuma exigir pesquisa dispersa, memoria manual de preferencias e validacao constante de informacoes. Em produtos baratos, a tendencia e gerar respostas superficiais ou alucinadas, o que compromete confianca e utilidade.

## Proposta do App

Palm Map oferece um copiloto mobile first que recebe origem, destino e duracao da viagem, aprende preferencias simples do usuario e devolve um roteiro validado por fontes grounded.

## Fluxo do Usuario

1. O usuario informa origem, destino e duracao.
2. O sistema coleta preferencias explicitas disponiveis.
3. O retrieval retorna opcoes e fatos com `source` e `confidence`.
4. O planner monta um roteiro por dias sem inventar lugares.
5. O usuario revisa o roteiro e ajusta preferencia quando necessario.

## Limitacoes do MVP

- memoria apenas com preferencias explicitas e schema simples
- retrieval inicialmente apoiado por mocks e fixtures
- agenda pessoal desacoplada e simplificada
- sem acompanhamento continuo da viagem nesta fase

## Fora de Escopo

- sincronizacao com calendarios reais
- banco de dados definitivo
- integracoes reais com providers externos
- automacoes de acompanhamento continuo
- recomendacoes altamente personalizadas baseadas em historico profundo

## Principios Anti-alucinacao

- planner nao cria itens sem evidencias grounded
- retrieval sempre informa `source` e `confidence`
- resultados fracos devem ser descartados ou explicitamente sinalizados
- quando faltarem dados, o sistema deve assumir lacuna, nao inventar completude

## Sequencia Recomendada de Implementacao

1. Definir contratos compartilhados do fluxo `plan-trip`.
2. Criar fixtures grounded de retrieval.
3. Implementar esqueleto do endpoint de orquestracao.
4. Montar uma UI mobile first para captura e exibicao basica.
5. Adicionar memoria simples de preferencias explicitas.
6. Refinar planner para distribuir roteiro por dias e sub-roteiros.

## Separacao de Responsabilidades

- retrieval fornece fatos e opcoes confiaveis
- planner organiza o roteiro com base nesses dados
- memoria influencia preferencias, mas nao decide o plano
- API apenas orquestra o fluxo entre os dominios
- UI apenas apresenta dados e captura input do usuario