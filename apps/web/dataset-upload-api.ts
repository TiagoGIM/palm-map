import type { DatasetUploadInput, DatasetUploadResult } from '../../packages/shared-types'
import { getAuthHeaders } from './api/session-token'
import { resolveApiUrl } from './api/resolve-api-url'

type DatasetApiError = {
  error: {
    code: string
    message: string
  }
}

export async function requestDatasetUpload(
  input: DatasetUploadInput,
): Promise<DatasetUploadResult> {
  const response = await fetch(resolveApiUrl('/dataset/upload'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as DatasetApiError
      message = body.error?.message ?? message
    } catch { /* ignore parse failure — use generic HTTP status message */ }
    throw new Error(message)
  }

  return (await response.json()) as DatasetUploadResult
}
