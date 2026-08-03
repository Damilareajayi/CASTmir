/**
 * CASTMIR backend — seed sessions
 * Combines real prompt text (ingested from OpenAssistant/oasst1) with
 * synthetic institutional metadata (college/department/model/date) to
 * build a 90-day window of session records. Quality + PMI are computed
 * for real from the actual prompt text via scoring.js — only the
 * institutional assignment and model routing are simulated.
 */
import { db } from './db.js'
import { MODELS, DRIFTING_MODELS, FSU_COLLEGES } from './constants.js'
import { scoreSession } from './scoring.js'

const DAYS = 90
const COLLEGE_NAMES = Object.keys(FSU_COLLEGES)

// Seeded deterministic PRNG so re-running seed gives a stable, reproducible dataset.
let seed = 20260101
function rand() {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}
function pick(arr) { return arr[Math.floor(rand() * arr.length)] }

function daysAgoISO(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function main() {
  const prompts = db.prepare('SELECT text FROM raw_prompts').all().map(r => r.text)
  if (!prompts.length) {
    console.error('No raw prompts found. Run `npm run ingest` first.')
    process.exit(1)
  }
  console.log(`Seeding ${DAYS}-day session window from ${prompts.length} real prompts...`)

  db.exec('DELETE FROM sessions')
  const insert = db.prepare(`
    INSERT INTO sessions (date, college, department, model, prompt_text, pmi_score, quality_score)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  let total = 0
  for (let i = 0; i < DAYS; i++) {
    const date    = daysAgoISO(DAYS - 1 - i)
    const dayFrac = i / (DAYS - 1)
    // Sinusoidal daily volume, same shape as the original mock generator.
    const sessionsToday = Math.round(Math.max(150, Math.min(950, 550 + Math.sin(i * 0.5) * 220 + (rand() - 0.5) * 120)))

    db.exec('BEGIN')
    for (let s = 0; s < sessionsToday; s++) {
      const model  = pick(MODELS)
      const college = pick(COLLEGE_NAMES)
      const dept    = pick(FSU_COLLEGES[college].depts)
      const promptText = pick(prompts)

      const { quality, pmi } = scoreSession(promptText, model.baseline, {
        drifting: DRIFTING_MODELS.has(model.name),
        dayFrac,
      })

      insert.run(date, college, dept, model.name, promptText, pmi, quality)
      total++
    }
    db.exec('COMMIT')

    if ((i + 1) % 30 === 0) console.log(`  day ${i + 1}/${DAYS} — ${total} sessions so far`)
  }

  console.log(`Done. Seeded ${total} sessions across ${DAYS} days in backend/data/castmir.db.`)
}

main()
