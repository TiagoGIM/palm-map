# domain-retrieval Instructions

- Toda resposta de retrieval deve retornar `source` e `confidence`.
- Cada item retornado deve conter no minimo:
  - name
  - location
  - source
  - confidence

- Priorize grounding e rastreabilidade antes de cobertura ampla.
- Nenhum dado pode ser inventado ou inferido sem marcacao clara.
- Nao enriquecer ou completar dados ausentes.

- Filtrar resultados por relevancia basica (localizacao, tipo, coerencia com a query).

- Se nao houver resultados confiaveis, explicite a ausencia de dados em vez de retornar lista vazia silenciosa.

- Prepare a camada para usar mocks primeiro e fontes reais depois.
- Mantenha contratos simples para consumo do planner.
