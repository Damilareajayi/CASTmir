/**
 * PRISM — Report Generator (Agent 4 extension)
 * Turns dashboard data into a plain-English narrative report — executive
 * or detailed — and exports it as PDF, Markdown, or plain text.
 */
import { jsPDF } from 'jspdf'
import { FSU_COLLEGES } from './constants.js'

const fmtPct  = v => `${v > 0 ? '+' : ''}${(+v).toFixed(1)}%`
const fmtNum  = v => (+v || 0).toLocaleString()
const shortCollege = c => c.replace('College of ','').replace('Herbert Wertheim ','').replace('Anne Spencer Daves ','')

function trendWord(change) {
  if (change > 0.5)  return 'improved'
  if (change < -0.5) return 'declined'
  return 'held steady'
}

const DRIFT_EXPLAIN = {
  'Model Drift':   'the AI model itself appears to have changed or gotten worse — often because the vendor quietly updated it',
  'Prompt Drift':  'people are writing weaker, vaguer prompts than they used to, which drags down the quality of what they get back',
  'Context Drift': 'the tool is being used in new or unfamiliar situations it wasn’t originally tuned for',
}

/** Build a structured report model from the dashboard's current data + filters. */
export function buildReport(data, { mode = 'executive', days = 30, college = null } = {}) {
  const scope = college && college !== 'all' ? shortCollege(college) : 'your institution'
  const k = data.kpis || {}

  const colleges = [...(data.colleges || [])].sort((a,b) => b.accuracy - a.accuracy)
  const bestCollege  = colleges[0]
  const worstCollege = colleges[colleges.length - 1]
  const alertColleges = colleges.filter(c => (c.active_alerts||0) > 0)

  const models = [...(data.models || [])].sort((a,b) => b.accuracy - a.accuracy)
  const bestModel  = models[0]
  const worstModel = models[models.length - 1]

  const driftDist = [...(data.driftDist || [])].sort((a,b) => b.count - a.count)
  const topDrift = driftDist[0]

  const activeEvents = (data.driftEvents || []).filter(e => e.status === 'active')
  const highSeverity = activeEvents.filter(e => e.severity === 'high')

  const pmiDist = data.pmiDist || []
  const totalPmi = pmiDist.reduce((s,p) => s + (p.count||0), 0)
  const lowPmiCount = pmiDist.filter(p => p.pmi_score <= 2).reduce((s,p) => s + (p.count||0), 0)
  const lowPmiPct = totalPmi ? Math.round((lowPmiCount / totalPmi) * 100) : null

  const now = new Date()
  const title = mode === 'detailed' ? 'PRISM Detailed Performance Report' : 'PRISM Executive Summary'
  const scopeLabel = scope.charAt(0).toUpperCase() + scope.slice(1)
  const subtitle = `${scopeLabel} · Last ${days} days · Generated ${now.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}`

  const sections = []

  // ── Executive summary (always included) ──────────────────────────
  const summaryParas = []
  summaryParas.push(
    `Over the last ${days} days, AI tool accuracy across ${scope} averaged ${k.overall_accuracy}%, which has ${trendWord(k.accuracy_change)} compared to the previous period (${fmtPct(k.accuracy_change)}). PRISM monitored ${fmtNum(k.total_sessions)} sessions in this window.`
  )
  if (k.active_alerts > 0) {
    summaryParas.push(
      `Right now there ${k.active_alerts === 1 ? 'is' : 'are'} ${k.active_alerts} active alert${k.active_alerts===1?'':'s'} that need attention` +
      (topDrift ? `, and the most common cause is ${topDrift.drift_type} — meaning ${DRIFT_EXPLAIN[topDrift.drift_type] || 'quality has shifted from its usual baseline'}.` : '.')
    )
  } else {
    summaryParas.push('No active degradation alerts were detected in this period — every tracked model is performing within its expected range.')
  }
  if (bestCollege && worstCollege && bestCollege !== worstCollege) {
    summaryParas.push(
      `${shortCollege(bestCollege.college)} is getting the most out of its AI tools right now at ${bestCollege.accuracy}% accuracy, while ${shortCollege(worstCollege.college)} is furthest behind at ${worstCollege.accuracy}% — a gap worth a closer look.`
    )
  }
  if (k.interventions != null) {
    summaryParas.push(`COACH, PRISM's recommendation engine, has stepped in with ${fmtNum(k.interventions)} coaching interventions this period to help people write better prompts.`)
  }
  sections.push({ heading: 'Executive Summary', paragraphs: summaryParas })

  if (mode !== 'detailed') {
    // Executive mode: a compact "what to do" list and stop there.
    const bullets = []
    if (highSeverity.length) bullets.push(`Investigate ${highSeverity.length} high-severity alert${highSeverity.length===1?'':'s'} first — these represent the sharpest quality drops.`)
    if (lowPmiPct != null && lowPmiPct > 40) bullets.push(`${lowPmiPct}% of prompts are still vague or unstructured — rolling out COACH coaching more broadly could raise quality quickly.`)
    if (worstCollege) bullets.push(`Share what's working in ${bestCollege ? shortCollege(bestCollege.college) : 'top colleges'} with ${shortCollege(worstCollege.college)}.`)
    if (worstModel && worstModel.accuracy < 80) bullets.push(`Consider routing away from ${worstModel.model} (${worstModel.accuracy}% accuracy) toward a stronger-performing model where possible.`)
    if (!bullets.length) bullets.push('Everything is tracking normally — no action needed this period.')
    sections.push({ heading: 'What We Recommend', bullets })
    return { title, subtitle, sections, mode }
  }

  // ── Detailed mode: expanded sections ──────────────────────────────
  sections.push({
    heading: 'Overall Performance',
    paragraphs: [
      `Overall accuracy sits at ${k.overall_accuracy}% (${fmtPct(k.accuracy_change)} vs. the prior period). Session volume ${trendWord(k.sessions_change)} as well, ${fmtPct(k.sessions_change)} for a total of ${fmtNum(k.total_sessions)} monitored sessions.`,
      `PRISM is currently tracking ${k.models_tracked} AI models across ${k.colleges_covered} college${k.colleges_covered===1?'':'s'}. Data source: ${k.data_source || 'live monitoring feed'}.`,
    ],
  })

  sections.push({
    heading: 'Model Performance',
    paragraphs: [
      `${bestModel ? `${bestModel.model} is the strongest performer at ${bestModel.accuracy}% accuracy across ${fmtNum(bestModel.sessions)} sessions.` : ''} ${worstModel && worstModel !== bestModel ? `${worstModel.model} trails the group at ${worstModel.accuracy}%.` : ''}`.trim(),
    ],
    bullets: models.map(m => `${m.model}: ${m.accuracy}% accuracy, ${fmtNum(m.sessions)} sessions, average prompt maturity ${m.avg_pmi?.toFixed?.(1) ?? m.avg_pmi}/5.`),
  })

  sections.push({
    heading: 'College Performance',
    paragraphs: [
      `Accuracy ranges from ${bestCollege?.accuracy}% (${bestCollege ? shortCollege(bestCollege.college) : '—'}) down to ${worstCollege?.accuracy}% (${worstCollege ? shortCollege(worstCollege.college) : '—'}) across ${colleges.length} colleges.`,
      alertColleges.length
        ? `${alertColleges.length} college${alertColleges.length===1?'':'s'} currently ${alertColleges.length===1?'has':'have'} active alerts: ${alertColleges.map(c=>shortCollege(c.college)).join(', ')}.`
        : 'No college currently has an active alert.',
    ],
  })

  sections.push({
    heading: 'Drift & Degradation Analysis',
    paragraphs: activeEvents.length ? [
      `${activeEvents.length} drift event${activeEvents.length===1?'':'s'} are currently active (${highSeverity.length} high severity). Breaking down by root cause:`,
      ...driftDist.map(d => `${d.drift_type} accounts for ${d.percentage ?? d.count}% of events — ${DRIFT_EXPLAIN[d.drift_type] || 'a shift from the established baseline'}.`),
    ] : ['No active drift events were detected in this period.'],
    bullets: highSeverity.slice(0, 8).map(e =>
      `${e.model} in ${shortCollege(e.college)}: accuracy dropped from ${e.baseline_score}% to ${e.current_score}% (${e.score_delta}%), classified as ${e.drift_type}.`
    ),
  })

  sections.push({
    heading: 'Prompt Quality & Learning Signal',
    paragraphs: lowPmiPct != null ? [
      `Prompt Maturity Index (PMI) measures how well-structured a person's prompt is, on a 1-5 scale. Right now, ${lowPmiPct}% of prompts fall into the two lowest tiers (vague, little to no context) — these consistently produce lower-quality answers.`,
      'This is the clearest lever PRISM has to improve outcomes without touching any model: coaching people toward more specific, structured prompts raises quality regardless of which AI tool they use.',
    ] : ['Prompt maturity data was not available for this period.'],
  })

  const recBullets = []
  if (highSeverity.length) recBullets.push(`Prioritize the ${highSeverity.length} high-severity alert${highSeverity.length===1?'':'s'} listed above — these are the largest quality drops.`)
  if (lowPmiPct != null && lowPmiPct > 40) recBullets.push(`Expand COACH prompt coaching — ${lowPmiPct}% of prompts are still low-maturity and are the fastest lever for improving quality.`)
  if (worstCollege && bestCollege && worstCollege !== bestCollege) recBullets.push(`Pair ${shortCollege(worstCollege.college)} with ${shortCollege(bestCollege.college)} to share prompting practices that are working well.`)
  if (worstModel && worstModel.accuracy < 80) recBullets.push(`Evaluate routing away from ${worstModel.model} where a higher-accuracy alternative exists.`)
  if (!recBullets.length) recBullets.push('No corrective action needed this period — continue routine monitoring.')
  sections.push({ heading: 'Recommendations', bullets: recBullets })

  sections.push({
    heading: 'About This Report',
    paragraphs: [
      `Generated automatically by PRISM's Reporting Engine (Agent 4) from ${k.data_source || 'the connected monitoring feed'}. Figures reflect the ${days}-day window ending ${now.toLocaleDateString()}.`,
    ],
  })

  return { title, subtitle, sections, mode }
}

// ── Export: Markdown / plain text ──────────────────────────────────
export function reportToMarkdown(report) {
  let md = `# ${report.title}\n\n_${report.subtitle}_\n\n`
  for (const sec of report.sections) {
    md += `## ${sec.heading}\n\n`
    for (const p of sec.paragraphs || []) md += `${p}\n\n`
    for (const b of sec.bullets || []) md += `- ${b}\n`
    if (sec.bullets?.length) md += '\n'
  }
  return md
}

export function downloadText(text, filename = 'report.txt', mime = 'text/plain;charset=utf-8;') {
  const blob = new Blob([text], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

// ── Export: PDF ──────────────────────────────────────────────────────
export function downloadReportPDF(report, filename = 'prism-report.pdf') {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const marginX = 56
  const pageH = doc.internal.pageSize.getHeight()
  const pageW = doc.internal.pageSize.getWidth()
  const maxW = pageW - marginX * 2
  let y = 60

  const ensure = (neededH) => {
    if (y + neededH > pageH - 56) { doc.addPage(); y = 60 }
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(120, 47, 64)
  doc.text(report.title, marginX, y); y += 22
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(120, 120, 120)
  doc.text(report.subtitle, marginX, y); y += 26

  for (const sec of report.sections) {
    ensure(30)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(120, 47, 64)
    doc.text(sec.heading, marginX, y); y += 18

    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(30, 30, 30)
    for (const p of sec.paragraphs || []) {
      const lines = doc.splitTextToSize(p, maxW)
      ensure(lines.length * 14 + 6)
      doc.text(lines, marginX, y)
      y += lines.length * 14 + 8
    }
    for (const b of sec.bullets || []) {
      const lines = doc.splitTextToSize(`•  ${b}`, maxW - 10)
      ensure(lines.length * 14 + 4)
      doc.text(lines, marginX + 6, y)
      y += lines.length * 14 + 4
    }
    y += 10
  }

  doc.save(filename)
}
