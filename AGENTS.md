# Global Instructions

- Mantenha o escopo enxuto.
- Prefira mudancas pequenas, locais e reversiveis.
- Evite dependencias desnecessarias.
- Priorize baixo custo operacional e simplicidade de manutencao.
- Nao implemente features fora do ticket atual.
- Nao expandir o escopo por conta propria.
- Se algo estiver fora do escopo, documente como sugestao em vez de implementar.

- Leia apenas os arquivos relevantes para a tarefa atual.
- Evite explorar o repositorio inteiro sem necessidade.
- Prefira contexto local (diretorio atual) antes de subir na hierarquia.

- Atualize a documentacao quando contratos, fluxos ou arquitetura mudarem.
- Prefira mocks, fixtures e adaptadores simples antes de integracoes reais.
- Respeite a separacao entre dominios, apps e agentes.
- Ao tocar mais de um dominio, explicite os contratos entre eles.

- Antes de mudancas estruturais, leia `README.md` e `docs/product/mvp.md`.

- Responda de forma objetiva e focada na tarefa.
- Evite explicacoes longas quando nao forem solicitadas.
- Gere apenas o codigo e arquivos necessarios para o objetivo.

- Nao explorar o repositorio inteiro; ler apenas o necessario para a tarefa.
- Sempre que possivel, usar contratos definidos em packages/shared-types.
- Nao inferir regras de negocio fora dos contratos ou do escopo da tarefa.