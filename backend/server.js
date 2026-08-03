/**
 * CASTMIR backend — Express server
 * Serves the same endpoint shapes src/mockData.js produces, but computed
 * from real ingested prompt text + synthetic institutional metadata in SQLite.
 * Also serves the built frontend (public/) and the COACH (Agent 3) Bedrock
 * proxy, so this one process is the whole deployable app.
 */
import express from 'express'
import corsMiddleware from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { resolveSource, listSources } from './sources/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT   = process.env.PORT || 8000
const REGION = process.env.AWS_REGION || 'us-east-1'
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

const app = express()
app.use(corsMiddleware())
app.use(express.json())

function parseQuery(req) {
  const days   = Math.max(1, Math.min(90, Number(req.query.days) || 30))
  const college = req.query.college && req.query.college !== 'all' ? req.query.college : null
  const source = resolveSource(req.query.source)
  return { days, college, source }
}

app.get('/api/sources', (_req, res) => res.json(listSources()))

app.get('/api/summary', (req, res) => {
  const { days, college, source } = parseQuery(req)
  res.json(source.getSummaryKPIs(days, college))
})

app.get('/api/accuracy/trends', (req, res) => {
  const { days, college, source } = parseQuery(req)
  res.json(source.getAccuracyTrends(days, college))
})

app.get('/api/sessions/volume', (req, res) => {
  const { days, college, source } = parseQuery(req)
  res.json(source.getSessionVolume(days, college))
})

app.get('/api/accuracy/by-college', (req, res) => {
  const { days, source } = parseQuery(req)
  res.json(source.getGroupBreakdown(days))
})

app.get('/api/models/comparison', (req, res) => {
  const { days, college, source } = parseQuery(req)
  res.json(source.getModelComparison(days, college))
})

app.get('/api/drift/distribution', (req, res) => {
  const { days, college, source } = parseQuery(req)
  res.json(source.getDriftDistribution(days, college))
})

app.get('/api/drift/events', (req, res) => {
  const { days, college, source } = parseQuery(req)
  res.json(source.getDriftEvents(days, college, req.query.status || 'all'))
})

app.get('/api/alerts', (req, res) => {
  const { days, college, source } = parseQuery(req)
  res.json(source.getDriftEvents(days, college, 'active'))
})

app.get('/api/pmi/distribution', (req, res) => {
  const { days, college, source } = parseQuery(req)
  res.json(source.getPmiDistribution(days, college))
})

app.get('/api/health', (_req, res) => res.json({ ok: true, source: 'CASTMIR backend — SQLite + real oasst1 prompts' }))

// ── COACH (Agent 3) — AWS Bedrock proxy ─────────────────────────────
// Credentials resolve from the runtime environment (App Runner instance
// role in production, local AWS CLI config in dev) — never from the client.
app.post('/api/coach', async (req, res) => {
  try {
    const { system, user, max_tokens = 900 } = req.body
    const client = new BedrockRuntimeClient({ region: REGION })
    const result = await client.send(new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: system }],
      messages: [{ role: 'user', content: [{ text: user }] }],
      inferenceConfig: { maxTokens: max_tokens },
    }))
    const text = result.output?.message?.content?.[0]?.text || ''
    res.json({ content: [{ type: 'text', text }] })
  } catch (e) {
    const hint = /credentials/i.test(e.message)
      ? 'AWS credentials not found on the server.'
      : e.message
    res.status(500).json({ error: hint })
  }
})

// ── Static frontend ──────────────────────────────────────────────────
const PUBLIC_DIR = path.join(__dirname, 'public')
app.use(express.static(PUBLIC_DIR))
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`CASTMIR listening on http://localhost:${PORT}`)
})
