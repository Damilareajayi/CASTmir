/**
 * PRISM backend — Express server
 * Serves the same endpoint shapes src/mockData.js produces, but computed
 * from real ingested prompt text + synthetic institutional metadata in SQLite.
 * Point the frontend at this by setting VITE_API_URL=http://localhost:8000 in PRISM/.env
 */
import express from 'express'
import corsMiddleware from 'cors'
import {
  getSummaryKPIs, getAccuracyTrends, getSessionVolume, getCollegeBreakdown,
  getModelComparison, getDriftEvents, getDriftDistribution, getPmiDistribution,
} from './aggregate.js'

const PORT = process.env.PORT || 8000
const app  = express()
app.use(corsMiddleware())

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

app.listen(PORT, () => {
  console.log(`PRISM backend listening on http://localhost:${PORT}`)
})
