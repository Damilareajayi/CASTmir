/**
 * CASTmir backend — aggregation queries
 * Turns raw `sessions` rows (real prompt text + synthetic institutional
 * metadata) into the exact JSON shapes src/mockData.js produces, so the
 * frontend renders identically whether it's pointed at mock data or here.
 */
import { db } from './db.js'
import { MODELS, FSU_COLLEGES } from './constants.js'
import { detectDrift } from './scoring.js'

const COLLEGE_NAMES = Object.keys(FSU_COLLEGES)
const COLLEGE_ABBR  = Object.fromEntries(COLLEGE_NAMES.map(c => [c, FSU_COLLEGES[c].abbr]))

function cutoffDate(days) {
  const d = new Date()
  d.setDate(d.getDate() - (days - 1))
  return d.toISOString().slice(0, 10)
}

function label(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Deterministic pseudo-value per model, used only for fields we have no
// real signal for yet (token count / latency / $ cost) — same idea as
// src/mockData.js, just seeded off the model id instead of Math.random().
function hashSeed(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}
function pseudo(str, min, max) {
  const h = hashSeed(str) % 10000
  return min + (h / 10000) * (max - min)
}

// ── Summary KPIs ────────────────────────────────────────────────────
export function getSummaryKPIs(days, college) {
  const cutoff = cutoffDate(days)
  const where  = college ? 'WHERE date >= ? AND college = ?' : 'WHERE date >= ?'
  const params = college ? [cutoff, college] : [cutoff]

  const { total, avgQ, avgPmi } = db.prepare(
    `SELECT COUNT(*) total, AVG(quality_score) avgQ, AVG(pmi_score) avgPmi FROM sessions ${where}`
  ).get(...params)

  const mid = db.prepare(
    `SELECT MIN(date) minD, MAX(date) maxD FROM sessions ${where}`
  ).get(...params)
  const midDate = mid.minD && mid.maxD
    ? new Date((new Date(mid.minD).getTime() + new Date(mid.maxD).getTime()) / 2).toISOString().slice(0, 10)
    : cutoff

  const half = (cmp) => db.prepare(
    `SELECT AVG(quality_score) q, COUNT(*) n FROM sessions ${where} AND date ${cmp} ?`
  ).get(...params, midDate)

  const first  = half('<')
  const second = half('>=')
  const accuracyChange = (second.q ?? avgQ) - (first.q ?? avgQ)
  const sessionsChange = first.n > 0 ? ((second.n - first.n) / first.n) * 100 : 0

  const lowPmi = db.prepare(
    `SELECT COUNT(*) n FROM sessions ${where} AND pmi_score <= 2`
  ).get(...params).n

  const events = computeDriftEvents(days, college)
  const activeAlerts = events.filter(e => e.status === 'active').length

  return {
    overall_accuracy: +(avgQ ?? 0).toFixed(1),
    accuracy_change:  +accuracyChange.toFixed(1),
    total_sessions:   total,
    sessions_change:  +sessionsChange.toFixed(1),
    active_alerts:    activeAlerts,
    interventions:    Math.round(lowPmi / 40),
    models_tracked:   MODELS.length,
    colleges_covered: college ? 1 : COLLEGE_NAMES.length,
    period_days:      days,
    data_source:      'OpenAssistant/oasst1 (real prompts) + synthetic FSU institutional metadata — pilot corpus',
  }
}

// ── Accuracy trends (per model, per day) ───────────────────────────
export function getAccuracyTrends(days, college) {
  const cutoff = cutoffDate(days)
  const where  = college ? 'WHERE date >= ? AND college = ?' : 'WHERE date >= ?'
  const params = college ? [cutoff, college] : [cutoff]

  const rows = db.prepare(
    `SELECT date, model, AVG(quality_score) q FROM sessions ${where} GROUP BY date, model ORDER BY date`
  ).all(...params)

  const byDate = new Map()
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, { date: label(r.date) })
    byDate.get(r.date)[r.model] = +r.q.toFixed(1)
  }
  return [...byDate.values()]
}

// ── Session volume + quality (per day) ─────────────────────────────
export function getSessionVolume(days, college) {
  const cutoff = cutoffDate(days)
  const where  = college ? 'WHERE date >= ? AND college = ?' : 'WHERE date >= ?'
  const params = college ? [cutoff, college] : [cutoff]

  const rows = db.prepare(
    `SELECT date, COUNT(*) sessions, AVG(quality_score) q FROM sessions ${where} GROUP BY date ORDER BY date`
  ).all(...params)

  return rows.map(r => ({ date: label(r.date), sessions: r.sessions, quality: +r.q.toFixed(1) }))
}

// ── College breakdown ───────────────────────────────────────────────
export function getCollegeBreakdown(days) {
  const cutoff = cutoffDate(days)
  const events = computeDriftEvents(days, null)

  return COLLEGE_NAMES.map(college => {
    const { n, avgQ } = db.prepare(
      `SELECT COUNT(*) n, AVG(quality_score) avgQ FROM sessions WHERE date >= ? AND college = ?`
    ).get(cutoff, college)

    const mid = db.prepare(`SELECT MIN(date) minD, MAX(date) maxD FROM sessions WHERE date >= ? AND college = ?`).get(cutoff, college)
    const midDate = mid.minD && mid.maxD
      ? new Date((new Date(mid.minD).getTime() + new Date(mid.maxD).getTime()) / 2).toISOString().slice(0, 10)
      : cutoff
    const first  = db.prepare(`SELECT AVG(quality_score) q FROM sessions WHERE date >= ? AND college = ? AND date < ?`).get(cutoff, college, midDate).q ?? avgQ
    const second = db.prepare(`SELECT AVG(quality_score) q FROM sessions WHERE date >= ? AND college = ? AND date >= ?`).get(cutoff, college, midDate).q ?? avgQ
    const delta = second - first

    const activeAlerts = events.filter(e => e.college === college && e.status === 'active').length

    return {
      college,
      abbr:          COLLEGE_ABBR[college],
      accuracy:      +(avgQ ?? 0).toFixed(1),
      sessions:      n,
      active_alerts: activeAlerts,
      trend_delta:   +delta.toFixed(1),
      trend:         delta > 0.3 ? 'up' : delta < -0.3 ? 'down' : 'stable',
    }
  }).sort((a, b) => b.accuracy - a.accuracy)
}

// ── Model comparison ────────────────────────────────────────────────
export function getModelComparison(days, college) {
  const cutoff = cutoffDate(days)
  const where  = college ? 'WHERE date >= ? AND college = ?' : 'WHERE date >= ?'
  const params = college ? [cutoff, college] : [cutoff]

  const rows = db.prepare(
    `SELECT model, COUNT(*) n, AVG(quality_score) avgQ, AVG(pmi_score) avgPmi, AVG(LENGTH(prompt_text)) avgLen
     FROM sessions ${where} GROUP BY model`
  ).all(...params)

  return rows.map(r => ({
    model:       r.model,
    accuracy:    +r.avgQ.toFixed(1),
    sessions:    r.n,
    avg_pmi:     +r.avgPmi.toFixed(2),
    avg_tokens:  Math.round(r.avgLen / 3.6),          // rough chars→tokens estimate on real prompt text
    avg_latency: +pseudo(r.model, 0.5, 2.6).toFixed(1),
    cost_per_1k: +pseudo(r.model + 'cost', 0.6, 7.5).toFixed(2),
  })).sort((a, b) => b.accuracy - a.accuracy)
}

// ── Drift detection (shared by events/distribution/alerts/summary) ─
function computeDriftEvents(days, college) {
  const cutoff = cutoffDate(days)
  const where  = college ? 'WHERE date >= ? AND college = ?' : 'WHERE date >= ?'
  const params = college ? [cutoff, college] : [cutoff]

  const rows = db.prepare(
    `SELECT model, college, date, AVG(quality_score) q, AVG(pmi_score) p
     FROM sessions ${where} GROUP BY model, college, date ORDER BY date`
  ).all(...params)

  const series = new Map() // "model||college" -> { q:[], p:[], lastDate }
  for (const r of rows) {
    const key = `${r.model}||${r.college}`
    if (!series.has(key)) series.set(key, { model: r.model, college: r.college, q: [], p: [], dates: [] })
    const s = series.get(key)
    s.q.push(r.q); s.p.push(r.p); s.dates.push(r.date)
  }

  const events = []
  let idx = 0
  for (const s of series.values()) {
    const drift = detectDrift(s.q, s.p)
    if (!drift) continue
    idx++
    const status = drift.alarmAt != null && drift.alarmAt < drift.seriesLength / 3 ? 'resolved' : 'active'
    events.push({
      event_id:       `EVT-${1000 + idx}`,
      model:          s.model,
      college:        s.college,
      drift_type:     drift.driftType,
      severity:       drift.severity,
      baseline_score: drift.baselineScore,
      current_score:  drift.currentScore,
      score_delta:    drift.scoreDelta,
      status,
      detected_at:    new Date(`${s.dates[s.dates.length - 1]}T00:00:00`).toISOString(),
    })
  }
  return events.sort((a, b) => a.score_delta - b.score_delta)
}

export function getDriftEvents(days, college, status = 'all') {
  const events = computeDriftEvents(days, college)
  return status === 'all' ? events : events.filter(e => e.status === status)
}

export function getDriftDistribution(days, college) {
  const events = computeDriftEvents(days, college)
  const total = events.length || 1
  const counts = {}
  for (const e of events) counts[e.drift_type] = (counts[e.drift_type] || 0) + 1
  return Object.entries(counts).map(([drift_type, count]) => ({
    drift_type, count, percentage: Math.round((count / total) * 100),
  }))
}

// ── PMI distribution ────────────────────────────────────────────────
export function getPmiDistribution(days, college) {
  const cutoff = cutoffDate(days)
  const where  = college ? 'WHERE date >= ? AND college = ?' : 'WHERE date >= ?'
  const params = college ? [cutoff, college] : [cutoff]

  const labels = {
    1: 'Vague — single query, no context',
    2: 'Basic — task stated, minimal context',
    3: 'Structured — task + context',
    4: 'Advanced — task + context + constraints',
    5: 'Expert — role + format + criteria + examples',
  }

  const rows = db.prepare(
    `SELECT ROUND(pmi_score) pmi, COUNT(*) n, AVG(quality_score) avgQ
     FROM sessions ${where} GROUP BY ROUND(pmi_score) ORDER BY pmi`
  ).all(...params)

  return rows
    .filter(r => r.pmi >= 1 && r.pmi <= 5)
    .map(r => ({
      pmi_score:   r.pmi,
      count:       r.n,
      avg_quality: +r.avgQ.toFixed(1),
      label:       labels[r.pmi],
    }))
}
