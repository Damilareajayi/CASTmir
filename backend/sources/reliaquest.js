/**
 * Data source adapter: ReliaQuest (preview)
 * ReliaQuest's real export hasn't landed yet, so this generates
 * deterministic placeholder data in the same response shape aggregate.js
 * produces — same contract, different grouping dimension (business unit,
 * not college/department) since that's what ReliaQuest's schema is
 * expected to look like. Swap the generator functions below for real
 * queries once the export arrives; the shape server.js expects won't change.
 */
const BUSINESS_UNITS = [
  'Security Operations', 'Threat Intelligence', 'Managed Detection & Response',
  'IT Infrastructure', 'Customer Success', 'Engineering',
]

const MODELS = ['ChatGPT Enterprise', 'GitHub Copilot', 'Gemini', 'Claude']

export const meta = {
  id: 'reliaquest',
  label: 'ReliaQuest (preview)',
  status: 'preview',
  description: 'Placeholder data — shape mirrors the real export ReliaQuest expects to provide. Numbers are illustrative only, not measured.',
  capabilities: {
    hasGroups: true,
    groupLabel: 'Business Unit',
    groupOptions: BUSINESS_UNITS,
    hasDepartments: false,
  },
}

// ── Deterministic PRNG so numbers are stable across requests for the
// same (days, group) pair instead of jumping on every refresh ─────────
function hashSeed(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}
function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function rngFor(...parts) { return mulberry32(hashSeed(parts.join('||'))) }

function dateRange(days) {
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}
function label(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function abbr(name) {
  return name.split(/[\s&]+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 5)
}

export function getSummaryKPIs(days, group) {
  const rnd = rngFor('summary', days, group)
  const scale = group ? 1 : BUSINESS_UNITS.length
  const total = Math.round(60 * scale * (days / 30) * (0.8 + rnd() * 0.4))
  const avgQ = 76 + rnd() * 12
  return {
    overall_accuracy: +avgQ.toFixed(1),
    accuracy_change:  +(rnd() * 4 - 1.5).toFixed(1),
    total_sessions:   total,
    sessions_change:  +(rnd() * 22 - 6).toFixed(1),
    active_alerts:    Math.round(1 + rnd() * 4),
    interventions:    Math.round(4 + rnd() * 12),
    models_tracked:   MODELS.length,
    colleges_covered: group ? 1 : BUSINESS_UNITS.length,
    period_days:      days,
    data_source:      'ReliaQuest — placeholder data, awaiting real export',
  }
}

export function getAccuracyTrends(days, group) {
  const dates = dateRange(days)
  return dates.map(d => {
    const row = { date: label(d) }
    for (const m of MODELS) {
      const rnd = rngFor('trend', d, group, m)
      row[m] = +(75 + rnd() * 18).toFixed(1)
    }
    return row
  })
}

export function getSessionVolume(days, group) {
  const dates = dateRange(days)
  const scale = group ? 1 : BUSINESS_UNITS.length
  return dates.map(d => {
    const rnd = rngFor('volume', d, group)
    return {
      date:     label(d),
      sessions: Math.round(8 * scale * (0.6 + rnd() * 0.8)),
      quality:  +(76 + rnd() * 14).toFixed(1),
    }
  })
}

export function getGroupBreakdown(days) {
  return BUSINESS_UNITS.map(bu => {
    const rnd = rngFor('group', days, bu)
    const delta = +(rnd() * 6 - 3).toFixed(1)
    return {
      college:       bu,
      abbr:          abbr(bu),
      accuracy:      +(76 + rnd() * 14).toFixed(1),
      sessions:      Math.round(60 * (days / 30) * (0.6 + rnd() * 0.8)),
      active_alerts: Math.round(rnd() * 3),
      trend_delta:   delta,
      trend:         delta > 0.3 ? 'up' : delta < -0.3 ? 'down' : 'stable',
    }
  }).sort((a, b) => b.accuracy - a.accuracy)
}

export function getModelComparison(days, group) {
  return MODELS.map(m => {
    const rnd = rngFor('model', days, group, m)
    return {
      model:       m,
      accuracy:    +(76 + rnd() * 14).toFixed(1),
      sessions:    Math.round(120 * (days / 30) * (0.6 + rnd() * 0.8)),
      avg_pmi:     +(2 + rnd() * 2.5).toFixed(2),
      avg_tokens:  Math.round(180 + rnd() * 600),
      avg_latency: +(0.5 + rnd() * 2.1).toFixed(1),
      cost_per_1k: +(0.6 + rnd() * 6.9).toFixed(2),
    }
  }).sort((a, b) => b.accuracy - a.accuracy)
}

const DRIFT_TYPES = ['Model Drift', 'Prompt Drift', 'Context Drift']

function computeDriftEvents(days, group) {
  const groups = group ? [group] : BUSINESS_UNITS
  const events = []
  let idx = 0
  for (const bu of groups) {
    for (const m of MODELS) {
      const rnd = rngFor('drift', days, bu, m)
      if (rnd() > 0.55) continue // not every model/unit pair drifts
      idx++
      const baseline = +(80 + rnd() * 10).toFixed(1)
      const current  = +(baseline - (2 + rnd() * 10)).toFixed(1)
      events.push({
        event_id:       `RQ-${1000 + idx}`,
        model:          m,
        college:        bu,
        drift_type:     DRIFT_TYPES[Math.floor(rnd() * DRIFT_TYPES.length)],
        severity:       rnd() > 0.7 ? 'high' : rnd() > 0.4 ? 'medium' : 'low',
        baseline_score: baseline,
        current_score:  current,
        score_delta:    +(current - baseline).toFixed(1),
        status:         rnd() > 0.3 ? 'active' : 'resolved',
        detected_at:    new Date().toISOString(),
      })
    }
  }
  return events.sort((a, b) => a.score_delta - b.score_delta)
}

export function getDriftEvents(days, group, status = 'all') {
  const events = computeDriftEvents(days, group)
  return status === 'all' ? events : events.filter(e => e.status === status)
}

export function getDriftDistribution(days, group) {
  const events = computeDriftEvents(days, group)
  const total = events.length || 1
  const counts = {}
  for (const e of events) counts[e.drift_type] = (counts[e.drift_type] || 0) + 1
  return Object.entries(counts).map(([drift_type, count]) => ({
    drift_type, count, percentage: Math.round((count / total) * 100),
  }))
}

export function getPmiDistribution(days, group) {
  const labels = {
    1: 'Vague — single query, no context',
    2: 'Basic — task stated, minimal context',
    3: 'Structured — task + context',
    4: 'Advanced — task + context + constraints',
    5: 'Expert — role + format + criteria + examples',
  }
  return [1, 2, 3, 4, 5].map(pmi => {
    const rnd = rngFor('pmi', days, group, pmi)
    return {
      pmi_score:   pmi,
      count:       Math.round(20 * (days / 30) * (0.4 + rnd())),
      avg_quality: +(70 + pmi * 4 + rnd() * 6).toFixed(1),
      label:       labels[pmi],
    }
  })
}
