# shared-types Instructions

- Mantenha contratos estaveis e legiveis.
- Evite tipos excessivamente abstratos ou genericos cedo demais.
- Priorize nomes claros e alinhados ao dominio do produto.
- Documente exemplos de payload sempre que um contrato novo surgir.

- Ao alterar contratos existentes, preservar compatibilidade sempre que possivel.
- Mudancas quebrando contratos devem ser pequenas, explicitas e documentadas.

- Nao modelar casos futuros ou hipoteticos antes de haver uso real no MVP.
- Sempre que fizer sentido, manter contratos preparados para validacao de runtime na borda da aplicacao.