/**
 * CASTmir — Report Generator (Agent 4 extension).
 * Turns dashboard data into a plain-English narrative report — executive or
 * detailed — and exports it as PDF, PPTX (admin only), HTML, Markdown, CSV,
 * or JSON. Ported from the original single-page app's src/report.js, which
 * was built around an FSU-college/multi-model shape; buildAdminReport and
 * buildUserReport here are rewritten against the current tool/alias-based
 * data model (backend-py/agents/reporter.py's admin_dashboard/
 * user_dashboard), everything else (export mechanics) carries over largely
 * unchanged since it was already data-shape-agnostic.
 */
import { jsPDF } from 'jspdf'
import { C, MODEL_COLORS } from './constants.js'

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fmtPct = v => `${v > 0 ? '+' : ''}${(+v).toFixed(1)}%`
const fmtNum = v => (+v || 0).toLocaleString()

function trendWord(change) {
  if (change > 0.5) return 'improved'
  if (change < -0.5) return 'declined'
  return 'held steady'
}

const DRIFT_EXPLAIN = {
  'model_drift': 'the AI model itself appears to have changed or gotten worse — often because the vendor quietly updated it',
  'prompt_drift': 'prompts are getting weaker or vaguer, which drags down the quality of what comes back',
  'context_drift': 'the tool is being used in new or unfamiliar situations it wasn’t originally tuned for',
  'Model Drift': 'the AI model itself appears to have changed or gotten worse — often because the vendor quietly updated it',
  'Prompt Drift': 'prompts are getting weaker or vaguer, which drags down the quality of what comes back',
  'Context Drift': 'the tool is being used in new or unfamiliar situations it wasn’t originally tuned for',
}

function halfSplitChange(rows, key) {
  const mid = Math.floor(rows.length / 2)
  const avg = arr => arr.length ? arr.reduce((s, r) => s + (r[key] || 0), 0) / arr.length : null
  const a = avg(rows.slice(0, mid)), b = avg(rows.slice(mid))
  return (a != null && b != null) ? b - a : 0
}

// "Daily"/"Weekly" read as a deliberate report cadence someone picked, not
// just a number of days — 1 and 7 are exactly the two the Reports tab's
// period buttons set days to, so this recognizes both automatically
// without needing a separate "period" concept threaded through here too.
function periodLabel(days) {
  if (days === 1) return 'Daily'
  if (days === 7) return 'Weekly'
  return `${days}-Day`
}

// ── Admin (cohort) report ───────────────────────────────────────────
export function buildAdminReport(data, { mode = 'executive', days = 30 } = {}) {
  const trend = data.accuracy_trend || []
  const totalSessions = trend.reduce((s, r) => s + (r.sessions || 0), 0)
  const overallQuality = trend.length ? trend.reduce((s, r) => s + (r.quality || 0), 0) / trend.length : null
  const change = halfSplitChange(trend, 'quality')

  const activeAlerts = (data.security_feed || []).filter(e => e.status === 'active')
  const tools = [...(data.tool_comparison || [])].sort((a, b) => (b.avg_quality || 0) - (a.avg_quality || 0))
  const bestTool = tools[0]
  const worstTool = tools[tools.length - 1]

  const driftEvents = data.drift_events || []
  const totalDrift = driftEvents.reduce((s, d) => s + d.n, 0)
  const topDrift = [...driftEvents].sort((a, b) => b.n - a.n)[0]

  const pmiDist = data.pmi_distribution || []
  const totalPmi = pmiDist.reduce((s, p) => s + (p.n || 0), 0)
  const lowPmiCount = pmiDist.filter(p => p.pmi_score <= 2).reduce((s, p) => s + (p.n || 0), 0)
  const lowPmiPct = totalPmi ? Math.round((lowPmiCount / totalPmi) * 100) : null

  const users = [...(data.user_activity || [])].sort((a, b) => b.sessions - a.sessions)
  const mostActive = users[0]
  const totalDevices = users.reduce((s, u) => s + (u.devices || 0), 0)

  const now = new Date()
  const period = periodLabel(days)
  const title = mode === 'detailed' ? `CASTmir ${period} Detailed Cohort Report` : `CASTmir ${period} Cohort Executive Summary`
  const subtitle = `${period === 'Daily' || period === 'Weekly' ? period : `Last ${days} days`} · Generated ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`

  const sections = []
  const summaryParas = [
    `Over the last ${days} day${days === 1 ? '' : 's'}, average prompt/response quality across the cohort was ${overallQuality != null ? overallQuality.toFixed(1) : '—'}%, which has ${trendWord(change)} within this window (${change ? fmtPct(change) : '—'}). CASTmir monitored ${fmtNum(totalSessions)} sessions from ${users.length} distinct user${users.length === 1 ? '' : 's'}.`,
  ]
  if (activeAlerts.length > 0) {
    summaryParas.push(
      `There ${activeAlerts.length === 1 ? 'is' : 'are'} ${activeAlerts.length} active security alert${activeAlerts.length === 1 ? '' : 's'} right now.` +
      (topDrift ? ` The most common drift type is ${topDrift.drift_type} — ${DRIFT_EXPLAIN[topDrift.drift_type] || 'a shift from the established baseline'}.` : ''),
    )
  } else {
    summaryParas.push('No active security alerts in this period.')
  }
  if (bestTool && worstTool && bestTool !== worstTool) {
    summaryParas.push(
      `${bestTool.tool} produced the strongest results at ${bestTool.avg_quality?.toFixed(1)}% average quality, while ${worstTool.tool} trailed at ${worstTool.avg_quality?.toFixed(1)}%.`,
    )
  }
  sections.push({ heading: 'Executive Summary', paragraphs: summaryParas })

  if (mode !== 'detailed') {
    const bullets = []
    if (activeAlerts.length) bullets.push(`Review the ${activeAlerts.length} active security alert${activeAlerts.length === 1 ? '' : 's'} — see the Security tab.`)
    if (lowPmiPct != null && lowPmiPct > 40) bullets.push(`${lowPmiPct}% of prompts are still low-maturity (PMI ≤ 2) — CASTmir's inline COACH nudge is the fastest lever to raise this.`)
    if (worstTool && bestTool && worstTool !== bestTool) bullets.push(`Look at why ${worstTool.tool} is trailing ${bestTool.tool} — could be selector drift, model version, or usage pattern.`)
    if (!bullets.length) bullets.push('Everything is tracking normally — no action needed this period.')
    sections.push({ heading: 'What We Recommend', bullets })
    return { title, subtitle, sections, mode }
  }

  sections.push({
    heading: 'Overall Performance',
    paragraphs: [
      `Average quality sits at ${overallQuality != null ? overallQuality.toFixed(1) : '—'}% across ${fmtNum(totalSessions)} sessions from ${users.length} distinct user${users.length === 1 ? '' : 's'} (${totalDevices} device${totalDevices === 1 ? '' : 's'} total).`,
    ],
  })

  sections.push({
    heading: 'Tool Performance',
    paragraphs: [
      `${bestTool ? `${bestTool.tool} is the strongest performer at ${bestTool.avg_quality?.toFixed(1)}% average quality across ${fmtNum(bestTool.sessions)} sessions.` : ''} ${worstTool && worstTool !== bestTool ? `${worstTool.tool} trails at ${worstTool.avg_quality?.toFixed(1)}%.` : ''}`.trim(),
    ],
    bullets: tools.map(t => `${t.tool}: ${t.avg_quality != null ? t.avg_quality.toFixed(1) : '—'}% avg quality, ${fmtNum(t.sessions)} sessions, avg threat score ${t.avg_threat != null ? t.avg_threat.toFixed(2) : '—'}.`),
  })

  sections.push({
    heading: 'User Activity',
    paragraphs: [
      mostActive ? `${mostActive.identity} is the most active user this period with ${fmtNum(mostActive.sessions)} sessions across ${mostActive.devices} device${mostActive.devices === 1 ? '' : 's'}.` : 'No user activity recorded in this period.',
    ],
    bullets: users.slice(0, 15).map(u => `${u.identity}: ${fmtNum(u.sessions)} sessions, ${u.avg_quality != null ? u.avg_quality.toFixed(1) : '—'}% avg quality, PMI ${u.avg_pmi != null ? u.avg_pmi.toFixed(1) : '—'}/5, ${u.devices} device${u.devices === 1 ? '' : 's'}.`),
  })

  sections.push({
    heading: 'Drift & Security',
    paragraphs: totalDrift ? [
      `${fmtNum(totalDrift)} drift event${totalDrift === 1 ? '' : 's'} detected. Breaking down by root cause:`,
      ...driftEvents.map(d => `${d.drift_type}: ${d.n} event${d.n === 1 ? '' : 's'} — ${DRIFT_EXPLAIN[d.drift_type] || 'a shift from the established baseline'}.`),
    ] : ['No drift events detected in this period.'],
    bullets: activeAlerts.slice(0, 10).map(e => `${(e.severity || '').toUpperCase()} — ${(e.threat_type || '').replace(/_/g, ' ')}, confidence ${Math.round((e.confidence || 0) * 100)}%, detected ${new Date(e.detected_at).toLocaleDateString()}.`),
  })

  sections.push({
    heading: 'Prompt Quality & Learning Signal',
    paragraphs: lowPmiPct != null ? [
      `Prompt Maturity Index (PMI) measures how well-structured a prompt is, on a 1–5 scale. ${lowPmiPct}% of prompts in this period fall into the two lowest tiers — these consistently produce lower-quality answers.`,
      'CASTmir’s inline COACH nudge (shown directly in the AI tool’s input box) is the most direct lever to raise this without any model changes.',
    ] : ['Prompt maturity data was not available for this period.'],
  })

  const recBullets = []
  if (activeAlerts.length) recBullets.push(`Review the ${activeAlerts.length} active alert${activeAlerts.length === 1 ? '' : 's'} in the Security tab.`)
  if (lowPmiPct != null && lowPmiPct > 40) recBullets.push(`${lowPmiPct}% of prompts are low-maturity — this is the fastest lever for improving quality across the cohort.`)
  if (worstTool && bestTool && worstTool !== bestTool) recBullets.push(`Investigate why ${worstTool.tool} trails ${bestTool.tool} in average quality.`)
  if (!recBullets.length) recBullets.push('No corrective action needed this period — continue routine monitoring.')
  sections.push({ heading: 'Recommendations', bullets: recBullets })

  sections.push({
    heading: 'About This Report',
    paragraphs: [`Generated automatically by CASTmir’s Reporting Engine (Agent 4). Figures reflect the ${days}-day window ending ${now.toLocaleDateString()}. Per-user rows are grouped by RECAST alias, never real names; no prompt or response content appears anywhere in this report.`],
  })

  return { title, subtitle, sections, mode }
}

// ── Personal (user) report ──────────────────────────────────────────
export function buildUserReport(data, { mode = 'executive', days = 30 } = {}) {
  const qTrend = data.quality_trend || []
  const pTrend = data.pmi_trend || []
  const overallQuality = qTrend.length ? qTrend.reduce((s, r) => s + (r.quality || 0), 0) / qTrend.length : null
  const overallPmi = pTrend.length ? pTrend.reduce((s, r) => s + (r.pmi || 0), 0) / pTrend.length : null
  const change = halfSplitChange(qTrend, 'quality')

  const tools = [...(data.tool_breakdown || [])].sort((a, b) => b.sessions - a.sessions)
  const topTool = tools[0]
  const totalSessions = tools.reduce((s, t) => s + t.sessions, 0)
  const sessions = data.sessions || []
  const activeAlerts = (data.security_events || []).filter(e => e.status === 'active')
  const interventions = data.recent_interventions || []

  const now = new Date()
  const period = periodLabel(days)
  const title = mode === 'detailed' ? `Your CASTmir ${period} Progress Report` : `Your CASTmir ${period} Summary`
  const subtitle = `${period === 'Daily' || period === 'Weekly' ? period : `Last ${days} days`} · Generated ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`

  const sections = []
  const summaryParas = [
    `Over the last ${days} day${days === 1 ? '' : 's'}, your average prompt/response quality was ${overallQuality != null ? overallQuality.toFixed(1) : '—'}%, which has ${trendWord(change)} within this window. You had ${fmtNum(totalSessions)} session${totalSessions === 1 ? '' : 's'} across ${tools.length} tool${tools.length === 1 ? '' : 's'}.`,
  ]
  if (overallPmi != null) {
    summaryParas.push(`Your average Prompt Maturity Index (PMI) was ${overallPmi.toFixed(1)}/5 — this measures how well-structured your prompts are (role, context, constraints, examples).`)
  }
  if (topTool) summaryParas.push(`${topTool.tool} is the tool you use most, with ${fmtNum(topTool.sessions)} sessions at ${topTool.avg_quality != null ? topTool.avg_quality.toFixed(1) : '—'}% average quality.`)
  if (activeAlerts.length) summaryParas.push(`You have ${activeAlerts.length} active security alert${activeAlerts.length === 1 ? '' : 's'} — worth a look before continuing.`)
  sections.push({ heading: 'Summary', paragraphs: summaryParas })

  if (mode !== 'detailed') {
    const bullets = []
    if (activeAlerts.length) bullets.push(`Check your ${activeAlerts.length} active security alert${activeAlerts.length === 1 ? '' : 's'}.`)
    if (overallPmi != null && overallPmi < 3) bullets.push(`Your prompts tend to be under-structured (PMI ${overallPmi.toFixed(1)}/5) — try the inline CASTmir suggestion next time it appears.`)
    if (!bullets.length) bullets.push('Nothing urgent — keep going.')
    sections.push({ heading: 'What To Try Next', bullets })
    return { title, subtitle, sections, mode }
  }

  sections.push({
    heading: 'Your Tool Usage',
    paragraphs: [`You used ${tools.length} tool${tools.length === 1 ? '' : 's'} this period.`],
    bullets: tools.map(t => `${t.tool}: ${fmtNum(t.sessions)} sessions, ${t.avg_quality != null ? t.avg_quality.toFixed(1) : '—'}% avg quality.`),
  })

  sections.push({
    heading: 'Recent Sessions',
    paragraphs: [`Your ${Math.min(sessions.length, 10)} most recent conversation${sessions.length === 1 ? '' : 's'}:`],
    bullets: sessions.slice(0, 10).map(s => `${s.tool} — ${s.turn_count} turn${s.turn_count === 1 ? '' : 's'}, outcome quality ${s.outcome_quality != null ? Math.round(s.outcome_quality) : '—'}%, session PMI ${s.session_pmi ?? '—'}/5.`),
  })

  if (interventions.length) {
    sections.push({
      heading: 'COACH Suggestions',
      paragraphs: [`CASTmir’s COACH has offered ${interventions.length} suggestion${interventions.length === 1 ? '' : 's'} recently.`],
      bullets: interventions.map(iv => `${iv.type}: PMI ${iv.pmi_before} → ${iv.pmi_after}, ${new Date(iv.delivered_at).toLocaleDateString()}.`),
    })
  }

  sections.push({
    heading: 'About This Report',
    paragraphs: [`Generated automatically by CASTmir from your own private data — never shared with the research team. Figures reflect the ${days}-day window ending ${now.toLocaleDateString()}.`],
  })

  return { title, subtitle, sections, mode }
}

// ── Export: Markdown / plain text (generic) ──────────────────────────
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
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

// ── Export: PDF (generic) ─────────────────────────────────────────────
export function downloadReportPDF(report, filename = 'castmir-report.pdf') {
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

// ── Export: Slides (PowerPoint, native charts) — admin only ──────────
export async function downloadAdminReportSlides(report, data, filename = 'castmir-cohort-report.pptx') {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'CASTmir', width: 10, height: 5.63 })
  pptx.layout = 'CASTmir'

  const hex = c => c.replace('#', '')
  const GARNET = hex(C.garnet), GOLD = hex(C.gold), DARK = hex(C.dark), GRAY = hex(C.gray)
  const PALETTE = MODEL_COLORS.map(hex)

  const footer = (slide, label) => {
    slide.addText('CASTmir · AI Performance & Security Monitor', { x: 0.4, y: 5.3, w: 6, h: 0.25, fontSize: 8, color: GRAY })
    slide.addText(label || '', { x: 6.4, y: 5.3, w: 3.2, h: 0.25, fontSize: 8, color: GRAY, align: 'right' })
  }
  const chartTitle = (slide, text) => {
    slide.addText(text, { x: 0.5, y: 0.35, w: 9, h: 0.6, fontSize: 24, bold: true, color: GARNET })
  }

  let slide = pptx.addSlide()
  slide.background = { color: GARNET }
  slide.addText('CASTmir', { x: 0.6, y: 1.7, w: 8.8, h: 1, fontSize: 48, bold: true, color: 'FFFFFF' })
  slide.addText(report.title, { x: 0.6, y: 2.65, w: 8.8, h: 0.6, fontSize: 22, bold: true, color: GOLD })
  slide.addText(report.subtitle, { x: 0.6, y: 3.2, w: 8.8, h: 0.5, fontSize: 13, color: 'F0E4D0' })
  slide.addText('RECAST Team · FSU Innovation Hub', { x: 0.6, y: 4.9, w: 8.8, h: 0.3, fontSize: 10, color: 'D8B9C4' })

  for (const sec of report.sections) {
    slide = pptx.addSlide()
    chartTitle(slide, sec.heading)
    const runs = []
    for (const p of sec.paragraphs || []) runs.push({ text: p, options: { fontSize: 13, color: DARK, breakLine: true, paraSpaceAfter: 12 } })
    for (const b of sec.bullets || []) runs.push({ text: b, options: { fontSize: 12, color: '404040', breakLine: true, bullet: { code: '2022' }, indentLevel: 1, paraSpaceAfter: 8 } })
    if (runs.length) slide.addText(runs, { x: 0.5, y: 1.1, w: 9, h: 4.0, valign: 'top', fontFace: 'Arial' })
    footer(slide, sec.heading)
  }

  const tools = [...(data.tool_comparison || [])].sort((a, b) => (b.avg_quality || 0) - (a.avg_quality || 0))
  if (tools.length) {
    slide = pptx.addSlide()
    chartTitle(slide, 'Tool Accuracy Comparison')
    slide.addChart(pptx.ChartType.bar, [{
      name: 'Avg quality %', labels: tools.map(t => t.tool), values: tools.map(t => Math.round(t.avg_quality || 0)),
    }], {
      x: 0.5, y: 1.1, w: 9, h: 4.0, chartColors: PALETTE, showLegend: false,
      showValue: true, dataLabelColor: DARK, dataLabelFontSize: 9,
      catAxisLabelColor: GRAY, valAxisLabelColor: GRAY, catAxisLabelFontSize: 10, valAxisLabelFontSize: 9,
      valAxisMinVal: 0, valAxisMaxVal: 100,
    })
    footer(slide, 'Tool Performance')
  }

  const trend = data.accuracy_trend || []
  if (trend.length) {
    slide = pptx.addSlide()
    chartTitle(slide, 'Quality Trend Over Time')
    slide.addChart(pptx.ChartType.line, [{
      name: 'Avg quality %', labels: trend.map(t => new Date(t.date).toLocaleDateString()), values: trend.map(t => Math.round(t.quality || 0)),
    }], {
      x: 0.5, y: 1.1, w: 9, h: 4.0, chartColors: PALETTE, showLegend: false,
      lineDataSymbol: 'none', lineSize: 2,
      catAxisLabelColor: GRAY, valAxisLabelColor: GRAY, catAxisLabelFontSize: 7, valAxisLabelFontSize: 9,
      catAxisLabelRotate: 45,
    })
    footer(slide, 'Overall Performance')
  }

  const driftEvents = data.drift_events || []
  if (driftEvents.length) {
    slide = pptx.addSlide()
    chartTitle(slide, 'Drift Type Distribution')
    slide.addChart(pptx.ChartType.pie, [{
      name: 'Drift events', labels: driftEvents.map(d => d.drift_type), values: driftEvents.map(d => d.n),
    }], {
      x: 2, y: 1.1, w: 6, h: 4.0, chartColors: PALETTE, showLegend: true, legendPos: 'b',
      legendColor: GRAY, legendFontSize: 10, showValue: true, dataLabelColor: 'FFFFFF', dataLabelFontSize: 10,
    })
    footer(slide, 'Drift & Security')
  }

  const pmiDist = data.pmi_distribution || []
  if (pmiDist.length) {
    slide = pptx.addSlide()
    chartTitle(slide, 'Prompt Maturity Index Distribution')
    slide.addChart(pptx.ChartType.bar, [{
      name: 'Sessions', labels: pmiDist.map(p => `PMI ${p.pmi_score}`), values: pmiDist.map(p => p.n),
    }], {
      x: 0.5, y: 1.1, w: 9, h: 4.0, chartColors: [GOLD], showLegend: false,
      showValue: true, dataLabelColor: DARK, dataLabelFontSize: 9,
      catAxisLabelColor: GRAY, valAxisLabelColor: GRAY, catAxisLabelFontSize: 10, valAxisLabelFontSize: 9,
    })
    footer(slide, 'Prompt Quality & Learning Signal')
  }

  const users = [...(data.user_activity || [])].sort((a, b) => b.sessions - a.sessions).slice(0, 10)
  if (users.length) {
    slide = pptx.addSlide()
    chartTitle(slide, 'Most Active Users (Top 10)')
    slide.addChart(pptx.ChartType.bar, [{
      name: 'Sessions', labels: users.map(u => u.identity), values: users.map(u => u.sessions),
    }], {
      x: 0.5, y: 1.1, w: 9, h: 4.0, chartColors: PALETTE, showLegend: false,
      showValue: true, dataLabelColor: DARK, dataLabelFontSize: 9,
      catAxisLabelColor: GRAY, valAxisLabelColor: GRAY, catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
    })
    footer(slide, 'User Activity')
  }

  await pptx.writeFile({ fileName: filename })
}

// ── Export: standalone HTML with inline SVG charts (generic) ─────────
function svgBarChart(items, { width = 560, height = 220, colors = [C.garnet], max = 100, valueFmt = v => `${v}%` } = {}) {
  const gap = width / items.length
  const barW = Math.min(48, gap * 0.6)
  const bars = items.map((it, i) => {
    const h = Math.max(2, (it.value / max) * (height - 40))
    const x = i * gap + (gap - barW) / 2
    const y = height - 30 - h
    const color = colors[i % colors.length]
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}" />
      <text x="${(x + barW / 2).toFixed(1)}" y="${height - 14}" font-size="10" fill="#555" text-anchor="middle">${esc(it.label)}</text>
      <text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" font-size="10" fill="#1C1C1C" text-anchor="middle" font-weight="700">${valueFmt(it.value)}</text>`
  }).join('')
  return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto;max-width:${width}px">${bars}</svg>`
}

function svgPieChart(items, { size = 200, colors = [C.garnet, C.teal, C.navy, C.amber, C.purple, C.green] } = {}) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1
  const r = size / 2 - 8, cx = size / 2, cy = size / 2
  let angle = -Math.PI / 2
  const slices = items.map((it, i) => {
    const frac = it.value / total
    const a0 = angle, a1 = angle + frac * Math.PI * 2
    angle = a1
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    const large = a1 - a0 > Math.PI ? 1 : 0
    return `<path d="M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${colors[i % colors.length]}" />`
  }).join('')
  const legend = items.map((it, i) => `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:#555;margin-bottom:4px">
      <span style="width:10px;height:10px;border-radius:2px;background:${colors[i % colors.length]};display:inline-block;flex-shrink:0"></span>
      ${esc(it.label)} — ${Math.round(it.value / total * 100)}%
    </div>`).join('')
  return `<div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">
      <svg viewBox="0 0 ${size} ${size}" style="width:180px;height:180px;flex-shrink:0">${slices}</svg>
      <div>${legend}</div>
    </div>`
}

/** chartData: { bars: {label, items: [{label,value}]} | null, pie: {label, items} | null } —
 * a generic shape so both the admin and user reports can pass whatever's relevant to them. */
export function downloadReportHTML(report, chartData = {}, filename = 'castmir-report.html') {
  const barChart = chartData.bars?.items?.length ? svgBarChart(chartData.bars.items, { colors: [C.garnet] }) : ''
  const pieChart = chartData.pie?.items?.length ? svgPieChart(chartData.pie.items) : ''

  const sectionsHtml = report.sections.map((sec, i) => `
    <section>
      <h2>${esc(sec.heading)}</h2>
      ${(sec.paragraphs || []).map(p => `<p>${esc(p)}</p>`).join('')}
      ${(sec.bullets || []).length ? `<ul>${sec.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      ${i === 1 && barChart ? `<div class="chart-block"><h3>${esc(chartData.bars.label || '')}</h3>${barChart}</div>` : ''}
      ${i === 1 && pieChart ? `<div class="chart-block"><h3>${esc(chartData.pie.label || '')}</h3>${pieChart}</div>` : ''}
    </section>`).join('')

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(report.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui,-apple-system,'Segoe UI',sans-serif; background:#F8F7F5; color:#1C1C1C; margin:0; padding:0; }
  .wrap { max-width:800px; margin:0 auto; padding:0 24px 80px; }
  header { background:linear-gradient(135deg,#5A1F2E,#782F40); color:#fff; padding:40px 24px; }
  header h1 { margin:0 0 6px; font-size:28px; }
  header .sub { color:#CEB888; font-size:13px; }
  h2 { color:#782F40; font-size:18px; border-bottom:1px solid #eee; padding-bottom:8px; margin-top:36px; }
  h3 { font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:#555; margin:20px 0 10px; }
  p { line-height:1.7; font-size:14px; color:#333; }
  ul { padding-left:20px; }
  li { line-height:1.7; font-size:14px; color:#333; margin-bottom:6px; }
  .chart-block { background:#fff; border:1px solid #eee; border-radius:10px; padding:16px; margin-top:14px; }
  footer { text-align:center; font-size:11px; color:#888; padding:24px; }
  @media (prefers-color-scheme: dark) {
    body { background:#15100f; color:#eee; }
    .chart-block { background:#221a19; border-color:#3a2c2a; }
    h2 { border-color:#3a2c2a; }
    p, li { color:#ddd; }
  }
</style>
</head>
<body>
  <header>
    <h1>${esc(report.title)}</h1>
    <div class="sub">${esc(report.subtitle)}</div>
  </header>
  <div class="wrap">
    ${sectionsHtml}
  </div>
  <footer>CASTmir · AI Performance & Security Monitor · RECAST Team, FSU Innovation Hub</footer>
</body>
</html>`

  downloadText(html, filename, 'text/html;charset=utf-8;')
}

// ── Raw data export: CSV / JSON (generic) ─────────────────────────────
function toCSV(rows = []) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0]).join(',')
  const lines = rows.map(r => Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
  return [headers, ...lines].join('\n')
}

export function downloadCSV(data, filename = 'castmir-export.csv') {
  const csv = Array.isArray(data) ? toCSV(data) : data
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadJSON(data, filename = 'castmir-export.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
