import { useState } from 'react'
import type { DatasetError } from '../../../../packages/shared-types'
import { requestDatasetUpload } from '../../dataset-upload-api'
import { Button } from '../primitives/Button'
import { Sheet } from '../overlays/Sheet'

type Step = 'prompt' | 'paste' | 'preview'

type ValidDoc = {
  id: string
  title: string
  category: string
  region: string
  city: string
}

type Props = {
  open: boolean
  onClose: () => void
}

const VALID_CATEGORIES = ['attraction', 'neighborhood', 'food_cafe', 'logistics']
const REQUIRED_FIELDS = ['id', 'city', 'title', 'category', 'region', 'summary', 'content', 'tags', 'source', 'updatedAt']

// Short prompt template shown in step 1 — backticks escaped to avoid terminating the literal
const PROMPT_TEMPLATE = 'Você é um especialista em turismo brasileiro. Gere um JSON array de documentos sobre lugares reais de [CIDADE], seguindo EXATAMENTE este schema.\n\n'
  + 'Retorne APENAS o JSON array, sem explicação, sem markdown, sem código ao redor.\n\n'
  + 'Schema de cada documento:\n'
  + '{\n'
  + '  "id": "string - <cidade-lowercase>-<category>-<slug-do-lugar>",\n'
  + '  "city": "[CIDADE]",\n'
  + '  "title": "string - nome do lugar",\n'
  + '  "category": "attraction | neighborhood | food_cafe | logistics",\n'
  + '  "region": "string - bairro ou zona (ex: Centro, Boa Viagem)",\n'
  + '  "summary": "string - 1-2 frases factuais sobre o lugar (min 10 chars)",\n'
  + '  "content": "string - 3-6 frases detalhando o lugar (min 30 chars)",\n'
  + '  "tags": ["string", "..."] - 3 a 6 palavras-chave,\n'
  + '  "source": "manual",\n'
  + '  "updatedAt": "YYYY-MM-DD - data de hoje"\n'
  + '}\n\n'
  + 'Categorias:\n'
  + '- attraction: museus, parques, igrejas, monumentos, praias\n'
  + '- neighborhood: bairros com carater turistico\n'
  + '- food_cafe: restaurantes, cafes, bares, mercados gastronomicos\n'
  + '- logistics: aeroportos, estacoes, terminais\n\n'
  + 'Regras:\n'
  + '- Nao invente enderecos ou horarios como fatos absolutos\n'
  + '- Use apenas conhecimento publico verificavel\n'
  + '- id deve usar apenas ASCII sem acentos\n'
  + '- Todos os 10 campos sao obrigatorios\n\n'
  + 'Lugares para gerar: [LISTA DE LUGARES SEPARADOS POR VIRGULA]'

export function DatasetManagerSheet({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>('prompt')
  const [rawJson, setRawJson] = useState('')
  const [validDocs, setValidDocs] = useState<ValidDoc[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [city, setCity] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ imported: number; errors: DatasetError[] } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function handleClose() {
    setStep('prompt')
    setRawJson('')
    setValidDocs([])
    setParseErrors([])
    setCity('')
    setIsUploading(false)
    setUploadResult(null)
    setUploadError(null)
    setCopied(false)
    onClose()
  }

  function handleCopyPrompt() {
    void navigator.clipboard.writeText(PROMPT_TEMPLATE).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleJsonChange(value: string) {
    setRawJson(value)
    if (!value.trim()) {
      setValidDocs([])
      setParseErrors([])
      return
    }

    if (value.length > 2 * 1024 * 1024) {
      setValidDocs([])
      setParseErrors(['JSON muito grande. Divida em lotes menores (máx. 2 MB).'])
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      setValidDocs([])
      setParseErrors(['JSON inválido — verifique a sintaxe'])
      return
    }

    if (!Array.isArray(parsed)) {
      setValidDocs([])
      setParseErrors(['O JSON deve ser um array de documentos'])
      return
    }

    const errors: string[] = []
    const docs: ValidDoc[] = []

    parsed.forEach((doc: unknown, i: number) => {
      const docErrors = validateDocClient(doc, i)
      if (docErrors.length > 0) {
        errors.push(...docErrors)
      } else {
        const d = doc as Record<string, unknown>
        docs.push({
          id: String(d['id']),
          title: String(d['title']),
          category: String(d['category']),
          region: String(d['region']),
          city: String(d['city']),
        })
      }
    })

    setValidDocs(docs)
    setParseErrors(errors)

    if (docs.length > 0 && !city) {
      setCity(docs[0].city)
    }
  }

  async function handleUpload() {
    if (validDocs.length === 0 || !city.trim() || isUploading) return
    setIsUploading(true)
    setUploadError(null)

    let parsed: unknown
    try {
      parsed = JSON.parse(rawJson)
    } catch {
      setUploadError('Erro ao fazer parse do JSON')
      setIsUploading(false)
      return
    }

    try {
      const result = await requestDatasetUpload({
        city: city.trim(),
        documents: parsed as unknown[],
      })
      setUploadResult({ imported: result.imported, errors: result.errors })
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro desconhecido ao fazer upload')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Sheet open={open} onClose={handleClose} title="Dataset Manager">
      {step === 'prompt' && (
        <div className="dataset-step">
          <p className="dataset-step__description">
            Use uma IA externa (Claude.ai, ChatGPT) para gerar o JSON de lugares.
            Copie o prompt abaixo, substitua <strong>[CIDADE]</strong> e <strong>[LISTA DE LUGARES]</strong>, e cole no chat da IA.
          </p>
          <textarea
            className="dataset-prompt-textarea"
            readOnly
            value={PROMPT_TEMPLATE}
            rows={12}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
          <div className="dataset-step__actions">
            <Button variant="tonal" onClick={handleCopyPrompt}>
              {copied ? 'Copiado!' : 'Copiar prompt'}
            </Button>
            <Button variant="filled" onClick={() => setStep('paste')}>
              Já tenho o JSON
            </Button>
          </div>
        </div>
      )}

      {step === 'paste' && (
        <div className="dataset-step">
          <p className="dataset-step__description">
            Cole o JSON retornado pela IA abaixo. A validação é feita em tempo real.
          </p>
          <textarea
            className="dataset-paste-textarea"
            placeholder='[{"id": "...", "city": "Recife", ...}]'
            value={rawJson}
            onChange={(e) => handleJsonChange(e.target.value)}
            rows={10}
          />
          {rawJson.trim() ? (
            <p className="dataset-validation-summary">
              {validDocs.length > 0 ? (
                <span className="dataset-validation-ok">
                  {validDocs.length} documento{validDocs.length !== 1 ? 's' : ''} válido{validDocs.length !== 1 ? 's' : ''}
                </span>
              ) : null}
              {parseErrors.length > 0 ? (
                <span className="dataset-validation-error">
                  {', '}{parseErrors.length} erro{parseErrors.length !== 1 ? 's' : ''}
                </span>
              ) : null}
            </p>
          ) : null}
          {parseErrors.length > 0 ? (
            <ul className="dataset-error-list">
              {parseErrors.slice(0, 8).map((err, i) => (
                <li key={`err-${i}`} className="dataset-error-item">{err}</li>
              ))}
              {parseErrors.length > 8 ? (
                <li className="dataset-error-item dataset-error-item--more">
                  +{parseErrors.length - 8} erros adicionais
                </li>
              ) : null}
            </ul>
          ) : null}
          <div className="dataset-step__actions">
            <Button variant="text" onClick={() => setStep('prompt')}>
              Voltar
            </Button>
            <Button
              variant="filled"
              disabled={validDocs.length === 0}
              onClick={() => setStep('preview')}
            >
              Continuar ({validDocs.length})
            </Button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="dataset-step">
          {uploadResult ? (
            <div className="dataset-success">
              <p className="dataset-success__message">
                {uploadResult.imported} documento{uploadResult.imported !== 1 ? 's' : ''} importado{uploadResult.imported !== 1 ? 's' : ''} com sucesso.
              </p>
              {uploadResult.errors.length > 0 ? (
                <ul className="dataset-error-list">
                  {uploadResult.errors.map((err, i) => (
                    <li key={`upload-err-${i}`} className="dataset-error-item">
                      {err.docId ? `[${err.docId}] ` : ''}{err.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button variant="filled" onClick={handleClose}>
                Fechar
              </Button>
            </div>
          ) : (
            <>
              <div className="dataset-preview-city">
                <label className="dataset-preview-city__label">Cidade</label>
                <input
                  type="text"
                  className="dataset-preview-city__input"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <p className="dataset-preview-count">
                {validDocs.length} documento{validDocs.length !== 1 ? 's' : ''} prontos para upload
              </p>
              <ul className="dataset-preview-list">
                {validDocs.map((doc) => (
                  <li key={doc.id} className="dataset-preview-item">
                    <span className="dataset-preview-item__title">{doc.title}</span>
                    <span className="dataset-preview-item__meta">
                      {doc.category} · {doc.region}
                    </span>
                  </li>
                ))}
              </ul>
              {uploadError ? (
                <p className="dataset-upload-error" role="alert">{uploadError}</p>
              ) : null}
              <div className="dataset-step__actions">
                <Button variant="text" onClick={() => setStep('paste')}>
                  Voltar
                </Button>
                <Button
                  variant="filled"
                  disabled={isUploading || validDocs.length === 0 || !city.trim()}
                  onClick={() => void handleUpload()}
                >
                  {isUploading ? 'Enviando...' : `Fazer upload (${validDocs.length})`}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Client-side validation (mirrors server rules)
// ---------------------------------------------------------------------------

function validateDocClient(doc: unknown, index: number): string[] {
  const errors: string[] = []
  const label = `doc[${index}]`

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    errors.push(`${label}: deve ser um objeto JSON`)
    return errors
  }

  const d = doc as Record<string, unknown>

  for (const field of REQUIRED_FIELDS) {
    if (d[field] === undefined || d[field] === null || d[field] === '') {
      errors.push(`${label}: campo obrigatório ausente: ${field}`)
    }
  }

  if (typeof d['category'] === 'string' && !VALID_CATEGORIES.includes(d['category'])) {
    errors.push(`${label}: category inválida "${d['category']}"`)
  }

  if (!Array.isArray(d['tags']) || d['tags'].length === 0) {
    errors.push(`${label}: tags deve ser um array não vazio`)
  }

  if (typeof d['updatedAt'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d['updatedAt'])) {
    errors.push(`${label}: updatedAt deve estar no formato YYYY-MM-DD`)
  }

  return errors
}
