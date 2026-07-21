/**
 * PRISM backend — ingest real human prompts from OpenAssistant/oasst1
 * (ungated, public dataset) via HuggingFace's datasets-server REST API.
 * No account or token required — used as realistic stand-in text for
 * LMSYS-Chat-1M until FSU's real data-sharing agreement grants access.
 */
import { db } from './db.js'

const DATASET  = 'OpenAssistant/oasst1'
const PAGE     = 100
const TARGET   = Number(process.env.INGEST_TARGET || 3000)   // rows to keep
const BASE_URL = 'https://datasets-server.huggingface.co/rows'

async function fetchPage(offset) {
  const url = `${BASE_URL}?dataset=${encodeURIComponent(DATASET)}&config=default&split=train&offset=${offset}&length=${PAGE}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HF datasets-server ${res.status}: ${await res.text()}`)
  return res.json()
}

async function main() {
  console.log(`Ingesting up to ${TARGET} real prompts from ${DATASET}...`)
  const insert = db.prepare('INSERT INTO raw_prompts (text, created_date) VALUES (?, ?)')

  let offset = 0
  let kept   = 0
  db.exec('DELETE FROM raw_prompts')

  while (kept < TARGET) {
    let page
    try {
      page = await fetchPage(offset)
    } catch (e) {
      console.error(`  fetch failed at offset ${offset}: ${e.message} — stopping early`)
      break
    }
    const rows = page.rows || []
    if (!rows.length) break

    db.exec('BEGIN')
    for (const { row } of rows) {
      if (row.role !== 'prompter') continue
      if (row.lang !== 'en') continue
      if (row.deleted) continue
      const text = (row.text || '').trim()
      if (text.length < 8) continue
      insert.run(text, row.created_date || null)
      kept++
    }
    db.exec('COMMIT')

    offset += PAGE
    if (offset % 1000 === 0) console.log(`  scanned ${offset} rows, kept ${kept}...`)
    if (rows.length < PAGE) break // exhausted dataset
  }

  console.log(`Done. Kept ${kept} real English prompts in backend/data/prism.db (raw_prompts).`)
}

main().catch(e => { console.error(e); process.exit(1) })
