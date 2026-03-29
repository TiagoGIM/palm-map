#!/usr/bin/env node
/**
 * Wrapper de retrocompatibilidade — chama o CLI genérico com os parâmetros de Recife v1.
 * Para uso direto, prefira ingest.mjs:
 *   node ingest.mjs --city Recife --input ../datasets/recife-v1.documents.json --id recife-v1
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const result = spawnSync(
  process.execPath,
  [
    resolve(__dirname, 'ingest.mjs'),
    '--city', 'Recife',
    '--input', resolve(__dirname, '../datasets/recife-v1.documents.json'),
    '--id', 'recife-v1',
  ],
  { stdio: 'inherit' },
)

process.exit(result.status ?? 0)
