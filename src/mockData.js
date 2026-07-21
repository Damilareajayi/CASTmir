/**
 * PRISM — Mock Data Engine
 * Simulates LMSYS-Chat-1M analysis. Same data shapes as the real FastAPI backend.
 * Switch to real data: set VITE_API_URL in .env
 */
import { MODELS, FSU_COLLEGES } from './constants.js'

// ── Seeded deterministic random ───────────────────────────────────
let seed = 42
const rand = (min = 0, max = 1) => {
  seed = (seed * 16807) % 2147483647
  return min + (seed / 2147483647) * (max - min)
}
const randN = (mean, std) => {
  const z = Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand())
  return mean + z * std
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const r1 = v => Math.round(v * 10) / 10

// ── Date helpers ──────────────────────────────────────────────────
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d }
const label   = d => d.toLocaleDateString('en-US', { month:'short', day:'numeric' })
const dates   = days => Array.from({ length: days }, (_, i) => label(daysAgo(days - 1 - i)))

// ── Accuracy trends ───────────────────────────────────────────────
export function getAccuracyTrends(days = 30) {
  seed = 42 + days
  return dates(days).map((date, i) => {
    const row = { date }
    MODELS.forEach(m => {
      const drift = (i > days * 0.6 && ['GPT-3.5','Copilot'].includes(m.name))
        ? -(i - days * 0.6) * 0.14 : 0
      row[m.name] = r1(clamp(m.baseline + drift + randN(0, 1.8) + Math.sin(i * 0.4) * 2, 60, 99))
    })
    return row
  })
}

// ── Session volume ────────────────────────────────────────────────
export function getSessionVolume(days = 30) {
  seed = 123 + days
  return dates(days).map((date, i) => ({
    date,
    sessions: Math.floor(clamp(1200 + Math.sin(i * 0.5) * 400 + randN(0, 80), 400, 3000)),
    quality:  r1(clamp(86 + Math.cos(i * 0.4) * 3 + randN(0, 1.2), 70, 98)),
  }))
}

// ── College breakdown ─────────────────────────────────────────────
export function getCollegeBreakdown() {
  seed = 777
  return Object.entries(FSU_COLLEGES).map(([name, meta]) => {
    const acc   = clamp(randN(86, 5), 72, 96)
    const delta = randN(0, 2)
    return {
      college:       name,
      abbr:          meta.abbr,
      accuracy:      r1(acc),
      sessions:      Math.floor(rand(800, 6000)),
      active_alerts: rand() > 0.75 ? Math.floor(rand(1, 5)) : 0,
      trend_delta:   r1(delta),
      trend:         delta > 0.3 ? 'up' : delta < -0.3 ? 'down' : 'stable',
    }
  }).sort((a, b) => b.accuracy - a.accuracy)
}

// ── Department breakdown ──────────────────────────────────────────
export function getDeptBreakdown(college) {
  seed = college.length * 31
  return (FSU_COLLEGES[college]?.depts || []).map(dept => ({
    department: dept,
    accuracy:   r1(clamp(randN(85, 6), 68, 98)),
    sessions:   Math.floor(rand(100, 1200)),
    avg_pmi:    r1(clamp(randN(2.8, 0.6), 1, 5)),
  })).sort((a, b) => b.accuracy - a.accuracy)
}

// ── Model comparison ──────────────────────────────────────────────
export function getModelComparison() {
  seed = 999
  return MODELS.map(m => ({
    model:       m.name,
    accuracy:    r1(clamp(randN(m.baseline, 2), 65, 98)),
    sessions:    Math.floor(rand(1500, 12000)),
    avg_pmi:     r1(clamp(randN(2.7, 0.5), 1, 5)),
    avg_tokens:  Math.floor(rand(200, 1800)),
    avg_latency: r1(clamp(randN(1.1, 0.3), 0.4, 3.5)),
    cost_per_1k: r1(clamp(randN(2.5, 1.5), 0.5, 8)),
  })).sort((a, b) => b.accuracy - a.accuracy)
}

// ── Drift distribution ────────────────────────────────────────────
export function getDriftDistribution() {
  return [
    { drift_type:'Prompt Drift',  count:48, percentage:48 },
    { drift_type:'Model Drift',   count:34, percentage:34 },
    { drift_type:'Context Drift', count:18, percentage:18 },
  ]
}

// ── Drift events ──────────────────────────────────────────────────
export function getDriftEvents(status = 'all') {
  seed = 555
  const colleges   = Object.keys(FSU_COLLEGES)
  const driftTypes = ['Prompt Drift','Model Drift','Context Drift']
  const severities = ['high','high','medium','medium','low']
  const statuses   = ['active','active','active','resolved','resolved']

  const events = Array.from({ length: 18 }, (_, i) => ({
    event_id:       `EVT-${1000 + i}`,
    model:          MODELS[i % MODELS.length].name,
    college:        colleges[i % colleges.length],
    drift_type:     driftTypes[i % driftTypes.length],
    severity:       severities[i % severities.length],
    baseline_score: r1(clamp(randN(87, 3), 78, 96)),
    current_score:  r1(clamp(randN(79, 4), 65, 90)),
    score_delta:    r1(-(rand(3, 14))),
    status:         statuses[i % statuses.length],
    detected_at:    daysAgo(Math.floor(rand(1, 21))).toISOString(),
  }))

  return status === 'all' ? events : events.filter(e => e.status === status)
}

// ── PMI distribution ──────────────────────────────────────────────
export function getPmiDistribution() {
  return [
    { pmi_score:1, count:8240,  avg_quality:71.2, label:'Vague — single query, no context' },
    { pmi_score:2, count:14380, avg_quality:78.8, label:'Basic — task stated, minimal context' },
    { pmi_score:3, count:17920, avg_quality:85.4, label:'Structured — task + context' },
    { pmi_score:4, count:6840,  avg_quality:91.6, label:'Advanced — task + context + constraints' },
    { pmi_score:5, count:2620,  avg_quality:96.1, label:'Expert — role + format + criteria + examples' },
  ]
}

// ── Summary KPIs ──────────────────────────────────────────────────
export function getSummaryKPIs(days = 30, college = null) {
  seed = 321 + days
  const base = college ? clamp(randN(87, 4), 76, 95) : 88.3
  return {
    overall_accuracy: r1(base),
    accuracy_change:  r1(randN(1.8, 1.5)),
    total_sessions:   Math.floor(rand(38000, 52000)),
    sessions_change:  r1(rand(5, 12)),
    active_alerts:    getDriftEvents('active').length,
    interventions:    Math.floor(rand(40, 90)),
    models_tracked:   MODELS.length,
    colleges_covered: Object.keys(FSU_COLLEGES).length,
    period_days:      days,
    data_source:      'LMSYS-Chat-1M pilot (simulated)',
  }
}

// ── Full dashboard bundle ─────────────────────────────────────────
export function getDashboardData({ days = 30, college = null } = {}) {
  return {
    kpis:        getSummaryKPIs(days, college),
    trends:      getAccuracyTrends(days),
    volume:      getSessionVolume(days),
    colleges:    getCollegeBreakdown(),
    models:      getModelComparison(),
    driftDist:   getDriftDistribution(),
    driftEvents: getDriftEvents(),
    alerts:      getDriftEvents('active'),
    pmiDist:     getPmiDistribution(),
    depts:       college ? getDeptBreakdown(college) : [],
  }
}
