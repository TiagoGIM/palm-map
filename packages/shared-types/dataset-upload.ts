/** Input for the POST /dataset/upload endpoint. */
export type DatasetUploadInput = {
  city: string
  documents: unknown[]
  /** Optional artifact ID prefix for chunk IDs (defaults to city slug). */
  artifactId?: string
}

/** Per-document validation or write error. */
export type DatasetError = {
  /** Zero-based index in the submitted documents array. */
  index: number
  docId?: string
  message: string
}

/** Result returned by POST /dataset/upload. */
export type DatasetUploadResult = {
  imported: number
  skipped: number
  errors: DatasetError[]
}
