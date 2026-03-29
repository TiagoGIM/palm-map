import type { DatasetUploadInput, DatasetUploadResult } from '../../packages/shared-types'

type DatasetApiError = {
  error: {
    code: string
    message: string
  }
}

const ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim()

export async function requestDatasetUpload(
  input: DatasetUploadInput,
): Promise<DatasetUploadResult> {
  const response = await fetch(resolveDatasetUploadUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const error = (await response.json()) as DatasetApiError
    throw new Error(error.error.message)
  }

  return (await response.json()) as DatasetUploadResult
}

function resolveDatasetUploadUrl(): string {
  if (ENV_API_BASE_URL) {
    const normalizedBase = ENV_API_BASE_URL.replace(/\/+$/, '')
    return `${normalizedBase}/dataset/upload`
  }

  if (isLocalWebEnvironment()) {
    return '/api/dataset/upload'
  }

  throw new Error(
    'VITE_API_BASE_URL nao configurado para ambiente publicado.',
  )
}

function isLocalWebEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1'
}
