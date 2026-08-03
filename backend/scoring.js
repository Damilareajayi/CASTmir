/**
 * CASTMIR backend — scoring & drift detection
 * Ported from src/agents.js (Agent 1 + Agent 2 logic) so the same math
 * that documents the frontend also runs server-side against real prompt text.
 */

// ═══════════════════════════════════════════════
// AGENT 1 — Performance Monitor
// ═══════════════════════════════════════════════

/** Prompt Maturity Index (1-5), computed from a *real* prompt string. */
export function computePMI(prompt = '') {
  if (!prompt) return 1
  const words   = prompt.split(/\s+/).length
  const hasRole = /you are|act as|as a|as an/i.test(prompt)
  const hasFmt  = /format|bullet|list|table|step|json|markdown/i.test(prompt)
  const hasCon  = /must|should|don.t|avoid|only|limit|maximum|minimum/i.test(prompt)
  const hasCtx  = prompt.length > 200
  const hasEx   = /example|for instance|such as/i.test(prompt)
  let score = 1
  if (words > 15)       score++
  if (hasCtx)            score++
  if (hasFmt || hasCon)  score++
  if (hasRole && hasEx)  score++
  return Math.min(score, 5)
}

/**
 * Heuristic quality score (0-100) for a real prompt against a model's baseline.
 * dayFrac (0-1) is how far through the analysis window this session falls —
 * used to apply a gradual drift for models flagged as degrading.
 */
export function scoreSession(promptText, baseline, { drifting = false, dayFrac = 0 } = {}) {
  const pmi     = computePMI(promptText)
  const len     = Math.min((promptText?.length || 0) / 1000 * 12, 12)
  const pmiBoost = (pmi - 3) * 3.2
  const drift   = drifting && dayFrac > 0.55 ? -(dayFrac - 0.55) * 42 : 0
  const noise   = (Math.random() - 0.5) * 5
  const quality = Math.max(40, Math.min(99, baseline + len + pmiBoost + drift + noise))
  return { quality: +quality.toFixed(1), pmi }
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
    const z = (baseline - x) / std
    sH = Math.max(0, sH + z - k)
    sL = Math.max(0, sL - z - k)
    sHist.push(+sH.toFixed(3))
    sLHist.push(+sL.toFixed(3))
    if (!alarm && (sH > h || sL > h)) { alarm = true; alarmAt = i }
  })

  return { alarm, alarmAt, maxCUSUM: +Math.max(...sHist, ...sLHist).toFixed(2) }
}

/** Three-way drift classification. */
export function classifyDrift({ qualityDrop = 0, pmiDrop = 0, qualityStd = 0 }) {
  if (pmiDrop > 0.3 && qualityDrop > 5)   return 'Prompt Drift'
  if (qualityStd > 8 && qualityDrop > 5)  return 'Context Drift'
  return 'Model Drift'
}

/** Full drift analysis over a real quality/PMI series. Null if no significant degradation. */
export function detectDrift(qualitySeries = [], pmiSeries = []) {
  if (qualitySeries.length < 6) return null
  const mid    = Math.floor(qualitySeries.length / 2)
  const base   = qualitySeries.slice(0, mid).reduce((a, v) => a + v, 0) / mid
  const recent = qualitySeries.slice(mid).reduce((a, v) => a + v, 0) / (qualitySeries.length - mid)
  const drop   = base - recent
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
    alarmAt:       cusum.alarmAt,
    seriesLength:  qualitySeries.length,
  }
}
