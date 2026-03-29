-- Uploaded document chunks: one row per chunk, upserted on re-upload.
-- Mirrors the chunk shape produced by ingest.mjs and baked into .ts artifacts.
-- City index uses lower() to match the normalizeText() used in retrieval scoring.
CREATE TABLE IF NOT EXISTS document_chunks (
  chunk_id   TEXT    PRIMARY KEY,
  doc_id     TEXT    NOT NULL,
  city       TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  category   TEXT    NOT NULL,
  region     TEXT    NOT NULL,
  summary    TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  snippet    TEXT    NOT NULL,
  tags       TEXT    NOT NULL,  -- JSON array serialized as TEXT
  source     TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_city ON document_chunks (lower(city));
