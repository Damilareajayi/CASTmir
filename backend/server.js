/**
 * PRISM backend — Express server
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
import {
  getSummaryKPIs, getAccuracyTrends, getSessionVolume, getCollegeBreakdown,
  getModelComparison, getDriftEvents, getDriftDistribution, getPmiDistribution,
} from './aggregate.js'

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
  return { days, college }
}

app.get('/api/summary', (req, res) => {
  const { days, college } = parseQuery(req)
  res.json(getSummaryKPIs(days, college))
})

app.get('/api/accuracy/trends', (req, res) => {
  const { days, college } = parseQuery(req)
  res.json(getAccuracyTrends(days, college))
})

app.get('/api/sessions/volume', (req, res) => {
  const { days, college } = parseQuery(req)
  res.json(getSessionVolume(days, college))
})

app.get('/api/accuracy/by-college', (req, res) => {
  const { days } = parseQuery(req)
  res.json(getCollegeBreakdown(days))
})

app.get('/api/models/comparison', (req, res) => {
  const { days, college } = parseQuery(req)
  res.json(getModelComparison(days, college))
})

app.get('/api/drift/distribution', (req, res) => {
  const { days, college } = parseQuery(req)
  res.json(getDriftDistribution(days, college))
})

app.get('/api/drift/events', (req, res) => {
  const { days, college } = parseQuery(req)
  res.json(getDriftEvents(days, college, req.query.status || 'all'))
})

app.get('/api/alerts', (req, res) => {
  const { days, college } = parseQuery(req)
  res.json(getDriftEvents(days, college, 'active'))
})

app.get('/api/pmi/distribution', (req, res) => {
  const { days, college } = parseQuery(req)
  res.json(getPmiDistribution(days, college))
})

app.get('/api/health', (_req, res) => res.json({ ok: true, source: 'PRISM backend — SQLite + real oasst1 prompts' }))

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
  console.log(`PRISM listening on http://localhost:${PORT}`)
})
