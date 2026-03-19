# shared-utils

Responsabilidade: reunir utilitarios pequenos e genuinamente compartilhados.

Pertence aqui:
- helpers de formatacao
- funcoes puras reutilizaveis entre apps e pacotes

Nao pertence aqui:
- tipos compartilhados
- regras de dominio
- wrappers de provider externos sem reuso real

- Nao usar este pacote como destino generico para codigo indefinido.
- Se um utilitario tiver semantica de dominio, ele deve ir para o dominio correspondente.

- Funcoes devem ser puras sempre que possivel.
- Evitar efeitos colaterais, IO ou dependencias externas.

- Evitar utilitarios complexos ou com multiplas responsabilidades.
- Preferir funcoes pequenas e especificas.

- Este pacote nao deve depender de dominios (domain-*).

Dependencias esperadas:
- no maximo `packages/shared-types` quando fizer sentido

Proximos arquivos importantes:
- validadores leves
- helpers de normalizacao