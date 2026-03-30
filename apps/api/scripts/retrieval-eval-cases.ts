/**
 * Retrieval evaluation case contract.
 *
 * - `id`: stable identifier used in reports (`<city>-NN` convention recommended).
 * - `city`: city sent to `/retrieve`.
 * - `query`: free-text user-like retrieval prompt.
 * - `expectResults`: when true, case passes only if at least one result is returned.
 */
export type RetrievalEvalCase = {
  id: string
  city: string
  query: string
  expectResults?: boolean
}

/**
 * João Pessoa MVP evaluation suite.
 *
 * Purpose:
 * - provide a curated baseline of user-like prompts for retrieval checks.
 * - keep case data versioned in code for deterministic CI/local runs.
 *
 * Expansion guidance:
 * - add new city blocks using a stable ID prefix (`<city-slug>-NN`);
 * - keep queries short and realistic;
 * - avoid changing existing IDs to preserve report history diffs.
 */
export const retrievalEvalCases: RetrievalEvalCase[] = [
  { id: 'jp-01', city: 'João Pessoa', query: 'praias e passeios', expectResults: true },
  { id: 'jp-02', city: 'João Pessoa', query: 'o que visitar em tambau', expectResults: true },
  { id: 'jp-03', city: 'João Pessoa', query: 'lugares no cabo branco', expectResults: true },
  { id: 'jp-04', city: 'João Pessoa', query: 'farol do cabo branco', expectResults: true },
  { id: 'jp-05', city: 'João Pessoa', query: 'estacao cabo branco cultura', expectResults: true },
  { id: 'jp-06', city: 'João Pessoa', query: 'piscinas naturais picaozinho', expectResults: true },
  { id: 'jp-07', city: 'João Pessoa', query: 'centro historico barroco', expectResults: true },
  { id: 'jp-08', city: 'João Pessoa', query: 'hotel globo por do sol', expectResults: true },
  { id: 'jp-09', city: 'João Pessoa', query: 'parque arruda camara bica', expectResults: true },
  { id: 'jp-10', city: 'João Pessoa', query: 'bairro manaira orla', expectResults: true },
  { id: 'jp-11', city: 'João Pessoa', query: 'bairro cabo branco', expectResults: true },
  { id: 'jp-12', city: 'João Pessoa', query: 'bairro tambau', expectResults: true },
  { id: 'jp-13', city: 'João Pessoa', query: 'aeroporto castro pinto', expectResults: true },
  { id: 'jp-14', city: 'João Pessoa', query: 'terminal varadouro onibus', expectResults: true },
  { id: 'jp-15', city: 'João Pessoa', query: 'igreja sao francisco', expectResults: true },
  { id: 'jp-16', city: 'João Pessoa', query: 'o que fazer no centro', expectResults: true },
  { id: 'jp-17', city: 'João Pessoa', query: 'pontos turisticos orla', expectResults: true },
  { id: 'jp-18', city: 'João Pessoa', query: 'recifes e barco', expectResults: true },
  { id: 'jp-19', city: 'João Pessoa', query: 'arquitetura oscar niemeyer', expectResults: true },
  { id: 'jp-20', city: 'João Pessoa', query: 'acesso aeroporto para cidade', expectResults: true },
  { id: 'jp-21', city: 'Joao Pessoa', query: 'praias urbanas', expectResults: true },
  { id: 'jp-22', city: 'JOAO PESSOA', query: 'farol e mirante', expectResults: true },
  { id: 'jp-23', city: 'João Pessoa', query: 'artesanato e feirinha', expectResults: true },
  { id: 'jp-24', city: 'João Pessoa', query: 'lugares para historia da cidade', expectResults: true },
]
