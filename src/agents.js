/**
 * PRISM — All Four Agents (browser-side JavaScript)
 *
 * Agent 1 — Performance Monitor  : session scoring + PMI
 * Agent 2 — Diagnostician        : CUSUM drift detection
 * Agent 3 — COACH                : AWS Bedrock-powered prompt rewriting via Vite proxy
 * Agent 4 — Reporting Engine     : CSV export
 */

// ═══════════════════════════════════════════════
// AGENT 1 — Performance Monitor
// ═══════════════════════════════════════════════

/** Heuristic quality score (0-100). Replaced by LLM-as-judge in production. */
export function scoreSession(conversation = [], modelName = '') {
  const baselines = {
    'GPT-4':88,'GPT-3.5':79,'Claude 3.5':91,
    'Gemini Pro':83,'Copilot':81,
  }
  const base      = baselines[modelName] || 80
  const responses = conversation.filter(m => m.role === 'assistant').map(m => m.content || '')
  if (!responses.length) return base

  const avgLen   = responses.reduce((a, r) => a + r.length, 0) / responses.length
  const struct   = responses.filter(r => /##|###|\*\*|^\d\.|^- /m.test(r)).length / responses.length
  const depth    = Math.min(conversation.length / 2 * 2, 10)
  const len      = Math.min(avgLen / 1000 * 15, 15)
  const brevPen  = avgLen < 100 ? -6 : 0
  const noise    = (Math.random() - 0.5) * 5
  return +(Math.max(40, Math.min(99, base + len + struct * 7 + depth + brevPen + noise))).toFixed(1)
}

/** Prompt Maturity Index (1-5). 1 = vague, 5 = expert structured prompt. */
export function computePMI(prompt = '') {
  if (!prompt) return 1
  const words    = prompt.split(/\s+/).length
  const hasRole  = /you are|act as|as a|as an/i.test(prompt)
  const hasFmt   = /format|bullet|list|table|step|json|markdown/i.test(prompt)
  const hasCon   = /must|should|don.t|avoid|only|limit|maximum|minimum/i.test(prompt)
  const hasCtx   = prompt.length > 200
  const hasEx    = /example|for instance|such as/i.test(prompt)
  let score = 1
  if (words > 15)          score++
  if (hasCtx)              score++
  if (hasFmt || hasCon)    score++
  if (hasRole && hasEx)    score++
  return Math.min(score, 5)
}


// ═══════════════════════════════════════════════
// AGENT 2 — Degradation Diagnostician
// ═══════════════════════════════════════════════

/** Page's CUSUM — detects when a series shifts from its baseline. */
export function runCUSUM(series, baseline, k = 0.5, h = 5.0) {
  const std = Math.sqrt(
    series.reduce((s, x) => s + (x - baseline) ** 2, 0) / series.length
  ) || 1
  let sH = 0, sL = 0, alarm = false, alarmAt = null
  const sHist = [], sLHist = []

  series.forEach((x, i) => {
    const z = (baseline - x) / std   // positive = degradation
    sH = Math.max(0, sH + z - k)
    sL = Math.max(0, sL - z - k)
    sHist.push(+sH.toFixed(3))
    sLHist.push(+sL.toFixed(3))
    if (!alarm && (sH > h || sL > h)) { alarm = true; alarmAt = i }
  })

  return {
    alarm,
    alarmAt,
    maxCUSUM: +Math.max(...sHist, ...sLHist).toFixed(2),
  }
}

/**
 * Three-way drift classification:
 * prompt_drift  — PMI dropped, users writing weaker prompts
 * context_drift — high variance, domain has shifted
 * model_drift   — quality dropped but PMI stable, model API changed
 */
export function classifyDrift({ qualityDrop = 0, pmiDrop = 0, qualityStd = 0 }) {
  if (pmiDrop > 0.3 && qualityDrop > 5)   return 'Prompt Drift'
  if (qualityStd > 8  && qualityDrop > 5)  return 'Context Drift'
  return 'Model Drift'
}

/** Full drift analysis. Returns null if no significant degradation. */
export function detectDrift(qualitySeries = [], baseline = null, pmiSeries = []) {
  if (qualitySeries.length < 6) return null
  const mid      = Math.floor(qualitySeries.length / 2)
  const base     = baseline ?? qualitySeries.slice(0, mid).reduce((a, v) => a + v, 0) / mid
  const recent   = qualitySeries.slice(mid).reduce((a, v) => a + v, 0) / (qualitySeries.length - mid)
  const drop     = base - recent
  if (drop < 4) return null

  const cusum = runCUSUM(qualitySeries, base)
  if (!cusum.alarm) return null

  const pmiBase   = pmiSeries.slice(0, mid).reduce((a, v) => a + v, 0) / (mid || 1)
  const pmiRecent = pmiSeries.slice(mid).reduce((a, v) => a + v, 0) / ((pmiSeries.length - mid) || 1)
  const std = Math.sqrt(qualitySeries.reduce((s, x) => s + (x - base) ** 2, 0) / qualitySeries.length)

  return {
    driftType:     classifyDrift({ qualityDrop: drop, pmiDrop: pmiBase - pmiRecent, qualityStd: std }),
    severity:      drop >= 10 ? 'high' : drop >= 6 ? 'medium' : 'low',
    baselineScore: +base.toFixed(1),
    currentScore:  +recent.toFixed(1),
    scoreDelta:    +(-drop).toFixed(1),
    cusumValue:    cusum.maxCUSUM,
  }
}


// ═══════════════════════════════════════════════
// AGENT 3 — COACH (Recommendation Engine)
// ═══════════════════════════════════════════════

/**
 * Rewrite a prompt via AWS Bedrock through the Vite server proxy.
 * AWS credentials are resolved server-side from the local AWS CLI config —
 * never reach the browser.
 */
export async function rewritePrompt(originalPrompt, context = {}) {
  const system = `You are COACH, the Recommendation Engine inside PRISM — an AI Performance Intelligence System for universities and institutions.

Your job: improve a user's AI prompt so they get better output quality, and explain what you changed so they learn over time.

Prompt Maturity Index (PMI) scale:
1 = Vague single query
2 = Task stated, no context
3 = Task + context
4 = Task + context + constraints + format
5 = Role + task + context + constraints + format + examples

Always preserve the user's original intent. Be direct and practical.`

  const user = `Improve this prompt for better AI output quality.

ORIGINAL PROMPT:
${originalPrompt}

CONTEXT:
- College: ${context.college || 'Not specified'}
- Department: ${context.department || 'Not specified'}
- AI Tool: ${context.model || 'Not specified'}
- Current quality score: ${context.quality_score ?? 'Unknown'}
- Current PMI: ${context.pmi_score ?? 'Unknown'}/5

Respond ONLY with valid JSON (no markdown fences):
{
  "rewritten_prompt": "The improved prompt",
  "explanation": "2-3 sentences on what changed and why",
  "key_improvements": ["improvement 1", "improvement 2", "improvement 3"],
  "pmi_before": 2,
  "pmi_after": 4,
  "estimated_quality_gain": "+8-12 points"
}`

  const res = await fetch('/api/coach', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ system, user, max_tokens: 900 }),
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error)

  const text  = data.content?.[0]?.text || ''
  const stripped = text.replace(/```json|```/g, '').trim()
  // Models occasionally add stray prose before/after the JSON despite
  // instructions — extract just the object so parsing doesn't break.
  const match = stripped.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : stripped)
}


// ═══════════════════════════════════════════════
// AGENT 4 — Reporting Engine
// ═══════════════════════════════════════════════

/** Convert an array of objects to a CSV string. */
export function toCSV(rows = []) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0]).join(',')
  const lines   = rows.map(r =>
    Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  )
  return [headers, ...lines].join('\n')
}

/** Trigger a CSV file download in the browser. */
export function downloadCSV(data, filename = 'prism-export.csv') {
  const csv  = Array.isArray(data) ? toCSV(data) : data
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

/** Trigger a JSON file download in the browser. */
export function downloadJSON(data, filename = 'prism-export.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
