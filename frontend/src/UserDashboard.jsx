import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { C, MODEL_COLORS } from './constants.js'
import { getUserDashboard } from './api.js'
import { Card, KPI, Table, TR, TD, Pill, ChartTip, CastmirBar, LiveBadge, useIsMobile } from './components/UI.jsx'
import SecurityPanel from './components/SecurityPanel.jsx'
import { buildUserReport, reportToMarkdown, downloadText, downloadReportPDF } from './report.js'

function initialUserHash() {
  // Arriving from the extension (icon click / "Open full dashboard") passes
  // ?hash=... directly — no manual entry needed in that path. Persist it so
  // a direct revisit to this URL later still works without the query param.
  const fromUrl = new URLSearchParams(window.location.search).get('hash')
  if (fromUrl) {
    localStorage.setItem('castmir_user_hash', fromUrl)
    return fromUrl
  }
  return localStorage.getItem('castmir_user_hash') || ''
}

export default function UserDashboard({ onBack }) {
  const isMobile = useIsMobile()
  const [userHash, setUserHash] = useState(initialUserHash)
  const [inputHash, setInputHash] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reportMode, setReportMode] = useState('executive')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [days, setDays] = useState(30)

  // opts.silent (used by the auto-refresh tick below) skips the loading
  // spinner / error banner so this page keeps itself current on its own —
  // matching the same pattern as AdminDashboard.jsx — without ever visibly
  // disrupting whatever you're currently looking at.
  const load = useCallback((opts = {}) => {
    if (!userHash) return
    if (!opts.silent) { setLoading(true); setError(null) }
    getUserDashboard(userHash, days)
      .then(d => { setData(d); setLastUpdated(Date.now()) })
      .catch(e => { if (!opts.silent) setError(e.message) })
      .finally(() => { if (!opts.silent) setLoading(false) })
  }, [userHash, days])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!userHash) return
    const id = setInterval(() => load({ silent: true }), 20000)
    return () => clearInterval(id)
  }, [userHash, load])

  if (!userHash) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 16, padding: 32, maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <img src="/mascot-head.png" alt="CASTmir" style={{ width: 48, marginBottom: 16 }} />
          <div style={{ fontWeight: 800, fontSize: 16, color: C.garnet, marginBottom: 8 }}>Your CASTmir Dashboard</div>
          <p style={{ fontSize: 12, color: C.gray, lineHeight: 1.7, marginBottom: 18 }}>
            This view is private to you — enter your CASTmir ID to see it. Find it in the extension
            popup (click the CASTmir icon in your browser toolbar).
          </p>
          <input value={inputHash} onChange={e => setInputHash(e.target.value)} placeholder="Your CASTmir ID"
            style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }} />
          <button onClick={() => { localStorage.setItem('castmir_user_hash', inputHash.trim()); setUserHash(inputHash.trim()) }}
            disabled={!inputHash.trim()}
            style={{ width: '100%', background: C.garnet, color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            View my dashboard
          </button>
          {onBack && (
            <button onClick={onBack} style={{ marginTop: 10, background: 'none', border: 'none', color: C.gray, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
              ← Back
            </button>
          )}
        </div>
      </div>
    )
  }

  const qualities = data?.quality_trend?.map(r => r.quality).filter(v => v != null) ?? []
  const pmis = data?.pmi_trend?.map(r => r.pmi).filter(v => v != null) ?? []
  const totalSessions = data?.tool_breakdown?.reduce((s, t) => s + t.sessions, 0) ?? 0
  const activeAlerts = data?.security_events?.filter(e => e.status === 'active').length ?? 0

  const qualitySeries = (data?.quality_trend ?? []).map(r => ({ date: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), quality: r.quality }))
  const pmiSeries = (data?.pmi_trend ?? []).map(r => ({ date: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), pmi: r.pmi }))

  const report = useMemo(() => {
    if (!data) return null
    return buildUserReport(data, { mode: reportMode, days })
  }, [data, reportMode, days])

  return (
    <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif', background: C.bg, minHeight: '100vh' }}>
      <CastmirBar h={4} onClick={onBack} />
      <div style={{ background: C.garnet, padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: onBack ? 'pointer' : 'default' }} onClick={onBack}>
          <img src="/mascot-head.png" alt="CASTmir" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 17, letterSpacing: 3 }}>CASTmir</div>
            <div style={{ color: C.gold, fontSize: 8, letterSpacing: 1, marginTop: -2 }}>YOUR PRIVATE DASHBOARD</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <LiveBadge lastUpdated={lastUpdated} light />
          <button onClick={() => load()} disabled={loading} style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 6, padding: '6px 14px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? '⟳ Refreshing…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      <div style={{ background: C.card, borderBottom: `0.5px solid ${C.border}`, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: C.gray, fontWeight: 600 }}>PERIOD</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {[[1, 'Today'], [7, 'Weekly'], [30, '30 days'], [90, '90 days']].map(([d, label]) => (
            <button key={d} onClick={() => setDays(d)} style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, cursor: 'pointer', border: `0.5px solid ${days === d ? C.garnet : C.border}`, background: days === d ? C.garnet : C.bg, color: days === d ? '#fff' : C.gray }}>
              {label}
            </button>
          ))}
        </div>
        {data?.timezone && <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto' }}>Times shown in your timezone ({data.timezone})</span>}
      </div>

      <div style={{ padding: isMobile ? '14px 12px' : '18px 20px', maxWidth: 1200, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: C.muted }}>Loading your dashboard...</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: C.red }}>{error}</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
              <KPI label="Avg quality" value={qualities.length ? `${Math.round(qualities.reduce((a, b) => a + b, 0) / qualities.length)}%` : '—'} color={C.garnet} />
              <KPI label="Avg PMI" value={pmis.length ? (pmis.reduce((a, b) => a + b, 0) / pmis.length).toFixed(1) : '—'} sub="/5" color={C.navy} />
              <KPI label={`Sessions (${days === 1 ? 'today' : `${days}d`})`} value={totalSessions} color={C.teal} />
              <KPI label="Active alerts" value={activeAlerts} color={activeAlerts > 0 ? C.red : C.green} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Card title="Your quality trend" sub={`Score per day, ${days === 1 ? 'today' : `last ${days} days`}`}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={qualitySeries} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTip />} />
                    <Line type="monotone" dataKey="quality" stroke={C.garnet} strokeWidth={2} dot={false} name="Quality" />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
              <Card title="Your PMI growth" sub="Prompt Maturity Index — the SDL progress signal">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={pmiSeries} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
                    <YAxis domain={[1, 5]} tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTip />} />
                    <Line type="monotone" dataKey="pmi" stroke={C.teal} strokeWidth={2} dot={false} name="PMI" />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </div>

            <Card title="What you've done on each AI tool" sub="How you use each tool, and how mature your prompts are there — side by side" style={{ marginBottom: 12 }}>
              {(data?.tool_breakdown ?? []).length > 0 && (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.tool_breakdown} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="tool" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                    <Tooltip content={<ChartTip />} />
                    <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="avg_quality" name="Avg quality" radius={[5, 5, 0, 0]}>
                      {data.tool_breakdown.map((_, i) => <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              <Table headers={['Tool', 'Sessions', 'Avg quality', 'Avg maturity (PMI)']}>
                {(data?.tool_breakdown ?? []).map((t, i) => (
                  <TR key={i}>
                    <TD><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: MODEL_COLORS[i % MODEL_COLORS.length], display: 'inline-block' }} /><strong>{t.tool}</strong></div></TD>
                    <TD style={{ color: C.gray }}>{t.sessions}</TD>
                    <TD>{t.avg_quality != null ? `${Math.round(t.avg_quality)}%` : '—'}</TD>
                    <TD>{t.avg_pmi != null ? `${t.avg_pmi.toFixed(1)}/5` : '—'}</TD>
                  </TR>
                ))}
              </Table>
              {(!data?.tool_breakdown || data.tool_breakdown.length === 0) && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: C.muted, fontSize: 12 }}>No tool usage yet.</div>
              )}
            </Card>

            <Card title="Recent sessions" sub="Grouped by conversation, not by turn — a clarifying question doesn't drag down the session's score" style={{ marginBottom: 12 }}>
              <Table headers={['Tool', 'Turns', 'Session PMI', 'Outcome quality', 'When']}>
                {(data?.sessions ?? []).map((s, i) => (
                  <TR key={i}>
                    <TD><strong>{s.tool}</strong></TD>
                    <TD style={{ color: C.gray }}>{s.turn_count}</TD>
                    <TD>{s.session_pmi != null ? `${s.session_pmi}/5` : '—'}</TD>
                    <TD>{s.outcome_quality != null ? `${Math.round(s.outcome_quality)}%` : '—'}</TD>
                    <TD style={{ color: C.muted }}>{new Date(s.session_start).toLocaleString()}</TD>
                  </TR>
                ))}
              </Table>
              {(!data?.sessions || data.sessions.length === 0) && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: C.muted, fontSize: 12 }}>No sessions yet.</div>
              )}
            </Card>

            <div style={{ marginBottom: 12 }}>
              <SecurityPanel events={data?.security_events ?? []} />
            </div>

            <Card title="Recent COACH suggestions">
              <Table headers={['Type', 'PMI before → after', 'Delivered']}>
                {(data?.recent_interventions ?? []).map((iv, i) => (
                  <TR key={i}>
                    <TD>{iv.type}</TD>
                    <TD>{iv.pmi_before} → {iv.pmi_after}</TD>
                    <TD style={{ color: C.muted }}>{new Date(iv.delivered_at).toLocaleDateString()}</TD>
                  </TR>
                ))}
              </Table>
              {(!data?.recent_interventions || data.recent_interventions.length === 0) && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: C.muted, fontSize: 12 }}>No suggestions yet.</div>
              )}
            </Card>

            <Card title="📄 My progress report" sub="Plain-English summary of your own activity — private to you" style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 3 }} role="group" aria-label="Report detail level">
                  {[['executive', 'Executive Summary'], ['detailed', 'Detailed Report']].map(([m, label]) => (
                    <button key={m} onClick={() => setReportMode(m)}
                      style={{ flex: isMobile ? 1 : 'none', padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: `0.5px solid ${reportMode === m ? C.garnet : C.border}`, background: reportMode === m ? C.garnet : C.bg, color: reportMode === m ? '#fff' : C.gray, fontWeight: reportMode === m ? 600 : 400 }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ marginLeft: isMobile ? 0 : 'auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'none', gridAutoFlow: isMobile ? 'row' : 'column', gap: 8 }}>
                  <button onClick={() => downloadReportPDF(report, `castmir-my-${reportMode}-report.pdf`)}
                    style={{ background: C.garnet, color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    ↓ Download PDF
                  </button>
                  <button onClick={() => downloadText(reportToMarkdown(report), `castmir-my-${reportMode}-report.md`, 'text/markdown;charset=utf-8;')}
                    style={{ background: C.bg, color: C.dark, border: `0.5px solid ${C.border}`, borderRadius: 7, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ↓ Download Markdown
                  </button>
                </div>
              </div>

              {report && (
                <div style={{ background: C.bg, border: `0.5px solid ${C.border}`, borderRadius: 10, padding: '20px 22px', maxHeight: 460, overflowY: 'auto' }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: C.garnet, marginBottom: 2 }}>{report.title}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 18 }}>{report.subtitle}</div>
                  {report.sections.map((sec, i) => (
                    <div key={i} style={{ marginBottom: 18 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.dark, marginBottom: 7 }}>{sec.heading}</div>
                      {(sec.paragraphs || []).map((p, j) => (
                        <p key={j} style={{ fontSize: 12.5, color: C.gray, lineHeight: 1.75, marginBottom: 8 }}>{p}</p>
                      ))}
                      {(sec.bullets || []).length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {sec.bullets.map((b, j) => (
                            <li key={j} style={{ fontSize: 12.5, color: C.gray, lineHeight: 1.75, marginBottom: 5 }}>{b}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
