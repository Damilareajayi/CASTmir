import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { C, MODEL_COLORS } from './constants.js'
import { getAdminDashboard } from './api.js'
import { Card, KPI, Table, TR, TD, ChartTip, CastmirBar, LiveBadge, useIsMobile } from './components/UI.jsx'
import SecurityPanel from './components/SecurityPanel.jsx'
import AgentStatus from './components/AgentStatus.jsx'
import SelectorHealth from './components/SelectorHealth.jsx'
import UserDrilldown from './components/UserDrilldown.jsx'
import EventLog from './components/EventLog.jsx'
import {
  buildAdminReport, reportToMarkdown, downloadText, downloadReportPDF,
  downloadAdminReportSlides, downloadReportHTML, downloadCSV, downloadJSON,
} from './report.js'

const TABS = ['Overview', 'Users', 'Agents', 'Security', 'Reports']
const AUTO_REFRESH_MS = 20000

export default function AdminDashboard({ onBack }) {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState('Overview')
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  // Held in sessionStorage only — never baked into the built JS bundle,
  // which anyone can read via view-source. Cleared when the tab closes.
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem('castmir_admin_token') || '')
  const [tokenInput, setTokenInput] = useState('')
  const [reportMode, setReportMode] = useState('executive')
  const [slidesBusy, setSlidesBusy] = useState(false)
  const [selectedIdentity, setSelectedIdentity] = useState(null)

  // opts.silent skips the loading spinner / error banner — used by the
  // auto-refresh tick below so the cohort view keeps itself current
  // without ever visibly disrupting whatever the admin is looking at. A
  // failed silent tick just tries again next interval instead of surfacing
  // an error; only the initial/explicit load (days or token changing)
  // shows the loading state.
  const load = useCallback((opts = {}) => {
    if (!adminToken) return
    if (!opts.silent) { setLoading(true); setError(null) }
    getAdminDashboard(days, adminToken)
      .then(d => { setData(d); setLastUpdated(Date.now()) })
      .catch(e => {
        if (e.message === 'UNAUTHORIZED') { sessionStorage.removeItem('castmir_admin_token'); setAdminToken('') }
        if (!opts.silent) setError(e.message)
      })
      .finally(() => { if (!opts.silent) setLoading(false) })
  }, [days, adminToken])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!adminToken) return
    const id = setInterval(() => load({ silent: true }), AUTO_REFRESH_MS)
    return () => clearInterval(id)
  }, [adminToken, load])

  if (!adminToken) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 16, padding: 32, maxWidth: 380, width: '100%', textAlign: 'center' }}>
          <img src="/mascot-head.png" alt="CASTmir" style={{ width: 48, marginBottom: 16 }} />
          <div style={{ fontWeight: 800, fontSize: 16, color: C.garnet, marginBottom: 8 }}>Admin access required</div>
          <p style={{ fontSize: 12, color: C.gray, lineHeight: 1.7, marginBottom: 18 }}>
            This dashboard shows aggregate cohort data. Enter the admin access code to continue.
          </p>
          <input type="password" value={tokenInput} onChange={e => setTokenInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && tokenInput.trim()) { sessionStorage.setItem('castmir_admin_token', tokenInput.trim()); setAdminToken(tokenInput.trim()) } }}
            placeholder="Admin access code"
            style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }} />
          <button onClick={() => { sessionStorage.setItem('castmir_admin_token', tokenInput.trim()); setAdminToken(tokenInput.trim()) }}
            disabled={!tokenInput.trim()}
            style={{ width: '100%', background: C.garnet, color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Enter
          </button>
          {error === 'UNAUTHORIZED' && <div style={{ color: C.red, fontSize: 11, marginTop: 10 }}>Incorrect code.</div>}
          {onBack && (
            <button onClick={onBack} style={{ marginTop: 10, background: 'none', border: 'none', color: C.gray, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
              ← Back
            </button>
          )}
        </div>
      </div>
    )
  }

  const totalSessions = data?.accuracy_trend?.reduce((s, r) => s + (r.sessions || 0), 0) ?? 0
  const avgQuality = data?.accuracy_trend?.length
    ? Math.round(data.accuracy_trend.reduce((s, r) => s + (r.quality || 0), 0) / data.accuracy_trend.length)
    : null
  const totalDrift = data?.drift_events?.reduce((s, r) => s + r.n, 0) ?? 0
  const activeSecurity = data?.security_feed?.filter(e => e.status === 'active').length ?? 0

  const accuracySeries = (data?.accuracy_trend ?? []).map(r => ({
    date: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), quality: r.quality, sessions: r.sessions,
  }))

  const report = useMemo(() => {
    if (!data) return null
    return buildAdminReport(data, { mode: reportMode, days })
  }, [data, reportMode, days])

  return (
    <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif', background: C.bg, minHeight: '100vh' }}>
      <CastmirBar h={4} onClick={onBack} />
      <div style={{ background: C.garnet, padding: isMobile ? '10px 14px' : '0 20px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', height: isMobile ? 'auto' : 56, gap: isMobile ? 10 : 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: onBack ? 'pointer' : 'default' }} onClick={onBack}>
          <img src="/mascot-head.png" alt="CASTmir" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 17, letterSpacing: 3 }}>CASTmir</div>
            <div style={{ color: C.gold, fontSize: 8, letterSpacing: 1, marginTop: -2 }}>ADMIN RESEARCH DASHBOARD — METRICS ONLY, NEVER PROMPT/RESPONSE CONTENT</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => { setTab(t); setSelectedIdentity(null) }} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, background: tab === t ? 'rgba(255,255,255,0.16)' : 'transparent', color: tab === t ? '#fff' : 'rgba(255,255,255,0.62)', fontWeight: tab === t ? 600 : 400 }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ background: C.card, borderBottom: `0.5px solid ${C.border}`, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 10, color: C.gray, fontWeight: 600 }}>TIME RANGE</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {[[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days']].map(([d, label]) => (
            <button key={d} onClick={() => setDays(d)} style={{ padding: '3px 9px', borderRadius: 5, fontSize: 11, cursor: 'pointer', border: `0.5px solid ${days === d ? C.garnet : C.border}`, background: days === d ? C.garnet : C.bg, color: days === d ? '#fff' : C.gray }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto' }}><LiveBadge lastUpdated={lastUpdated} /></div>
      </div>

      <div style={{ padding: isMobile ? '14px 12px' : '18px 20px', maxWidth: 1400, margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: C.muted }}>Loading cohort data...</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: C.red }}>{error}</div>
        ) : (
          <>
            {tab === 'Overview' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
                  <KPI label="Sessions" value={totalSessions.toLocaleString()} sub={`last ${days} days`} color={C.teal} />
                  <KPI label="Avg quality" value={avgQuality != null ? `${avgQuality}%` : '—'} color={C.garnet} />
                  <KPI label="Drift events" value={totalDrift} color={C.navy} />
                  <KPI label="Active security alerts" value={activeSecurity} color={activeSecurity > 0 ? C.red : C.green} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.8fr 1fr', gap: 12, marginBottom: 12 }}>
                  <Card title="Cohort accuracy trend" sub="Average quality score across all pilot users">
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={accuracySeries} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
                        <Tooltip content={<ChartTip />} />
                        <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="quality" stroke={C.garnet} strokeWidth={2} dot={false} name="Quality" />
                      </LineChart>
                    </ResponsiveContainer>
                  </Card>

                  <Card title="Drift types" sub="Root cause classification">
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={data?.drift_events ?? []} cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3} dataKey="n" nameKey="drift_type">
                          {(data?.drift_events ?? []).map((_, i) => <Cell key={i} fill={[C.navy, C.amber, C.purple][i % 3]} />)}
                        </Pie>
                        <Tooltip formatter={(v, n) => [`${v}`, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </Card>
                </div>

                <Card title="PMI distribution" sub="Prompt sophistication across the cohort" style={{ marginBottom: 12 }}>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={data?.pmi_distribution ?? []} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                      <XAxis dataKey="pmi_score" tick={{ fontSize: 11, fill: C.gray }} tickLine={false} axisLine={false} tickFormatter={v => `PMI ${v}`} />
                      <YAxis tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="n" name="Sessions" radius={[5, 5, 0, 0]} fill={C.garnet} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <Card title="Tool accuracy comparison" sub="Average quality score">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={data?.tool_comparison ?? []} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                        <XAxis dataKey="tool" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                        <Tooltip content={<ChartTip />} />
                        <Bar dataKey="avg_quality" name="Avg quality" radius={[5, 5, 0, 0]}>
                          {(data?.tool_comparison ?? []).map((_, i) => <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                  <Card title="Session volume by tool" sub="Total sessions in selected period">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={data?.tool_comparison ?? []} layout="vertical" margin={{ top: 4, right: 10, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
                        <YAxis dataKey="tool" type="category" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} width={78} />
                        <Tooltip content={<ChartTip />} />
                        <Bar dataKey="sessions" name="Sessions" radius={[0, 5, 5, 0]}>
                          {(data?.tool_comparison ?? []).map((_, i) => <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </div>

                <Card title="Tool comparison">
                  <Table headers={['Tool', 'Sessions', 'Avg quality', 'Avg maturity (PMI)', 'Avg threat score']}>
                    {(data?.tool_comparison ?? []).map((t, i) => (
                      <TR key={i}>
                        <TD><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: MODEL_COLORS[i % MODEL_COLORS.length], display: 'inline-block' }} /><strong>{t.tool}</strong></div></TD>
                        <TD style={{ color: C.gray }}>{t.sessions?.toLocaleString()}</TD>
                        <TD>{t.avg_quality != null ? `${Math.round(t.avg_quality)}%` : '—'}</TD>
                        <TD>{t.avg_pmi != null ? `${t.avg_pmi.toFixed(1)}/5` : '—'}</TD>
                        <TD style={{ color: t.avg_threat > 0.3 ? C.red : C.gray }}>{t.avg_threat != null ? t.avg_threat.toFixed(2) : '—'}</TD>
                      </TR>
                    ))}
                  </Table>
                </Card>
              </div>
            )}

            {tab === 'Users' && (
              selectedIdentity ? (
                <UserDrilldown identity={selectedIdentity} days={days} adminToken={adminToken} onBack={() => setSelectedIdentity(null)} />
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <Card title="Users by session volume" sub="Top 10 by sessions in the selected period">
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={(data?.user_activity ?? []).slice(0, 10)} layout="vertical" margin={{ top: 4, right: 10, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
                          <YAxis dataKey="identity" type="category" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} width={90} />
                          <Tooltip content={<ChartTip />} />
                          <Bar dataKey="sessions" name="Sessions" radius={[0, 5, 5, 0]}>
                            {(data?.user_activity ?? []).slice(0, 10).map((_, i) => <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                    <Card title="Users by avg quality" sub="Top 10 by sessions, quality compared side by side">
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={(data?.user_activity ?? []).slice(0, 10)} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                          <XAxis dataKey="identity" tick={{ fontSize: 9, fill: C.gray }} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={46} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
                          <Tooltip content={<ChartTip />} />
                          <Bar dataKey="avg_quality" name="Avg quality" radius={[5, 5, 0, 0]} fill={C.garnet} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Card>
                  </div>

                  <Card title="User activity" sub="Grouped by RECAST alias — the same person on multiple devices shows as one row. Click a row to see their full dashboard. Never shows prompt/response content.">
                    <Table headers={['Alias', 'Devices', 'Sessions', 'Avg quality', 'Avg maturity (PMI)', 'Last active']}>
                      {(data?.user_activity ?? []).map((u, i) => (
                        <TR key={i} onClick={() => setSelectedIdentity(u.identity)}>
                          <TD><strong>{u.identity}</strong></TD>
                          <TD style={{ color: C.gray }}>{u.devices}</TD>
                          <TD style={{ color: C.gray }}>{u.sessions?.toLocaleString()}</TD>
                          <TD>{u.avg_quality != null ? `${Math.round(u.avg_quality)}%` : '—'}</TD>
                          <TD>{u.avg_pmi != null ? `${u.avg_pmi.toFixed(1)}/5` : '—'}</TD>
                          <TD style={{ color: C.muted }}>{u.last_active ? new Date(u.last_active).toLocaleString() : '—'}</TD>
                        </TR>
                      ))}
                    </Table>
                    {(!data?.user_activity || data.user_activity.length === 0) && (
                      <div style={{ textAlign: 'center', padding: '20px 0', color: C.muted, fontSize: 12 }}>No activity yet.</div>
                    )}
                  </Card>

                  <Card
                    title="Prompting improvement — is CASTmir COACH working?"
                    sub="Compares each person's average prompt maturity (PMI) in the first half of this period against the second half. Needs at least 4 sessions in the window to show a trend — noise otherwise."
                    style={{ marginTop: 12 }}>
                    {(data?.user_improvement ?? []).length > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height={Math.max(160, (data.user_improvement.length) * 34)}>
                          <BarChart data={data.user_improvement} layout="vertical" margin={{ top: 4, right: 30, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} tickFormatter={v => `${v > 0 ? '+' : ''}${v}`} />
                            <YAxis dataKey="identity" type="category" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} width={90} />
                            <Tooltip content={<ChartTip />} />
                            <Bar dataKey="pmi_gain" name="PMI change" radius={[0, 5, 5, 0]}>
                              {data.user_improvement.map((r, i) => <Cell key={i} fill={r.pmi_gain >= 0 ? C.green : C.red} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <Table headers={['Alias', 'Sessions', 'Early PMI', 'Recent PMI', 'Change', 'COACH suggestions received']}>
                          {data.user_improvement.map((r, i) => (
                            <TR key={i} onClick={() => setSelectedIdentity(r.identity)}>
                              <TD><strong>{r.identity}</strong></TD>
                              <TD style={{ color: C.gray }}>{r.sessions}</TD>
                              <TD>{r.early_avg_pmi != null ? r.early_avg_pmi.toFixed(1) : '—'}</TD>
                              <TD>{r.recent_avg_pmi != null ? r.recent_avg_pmi.toFixed(1) : '—'}</TD>
                              <TD style={{ color: r.pmi_gain >= 0 ? C.green : C.red, fontWeight: 700 }}>
                                {r.pmi_gain != null ? `${r.pmi_gain > 0 ? '+' : ''}${r.pmi_gain}` : '—'}
                              </TD>
                              <TD style={{ color: C.gray }}>{r.intervention_count}</TD>
                            </TR>
                          ))}
                        </Table>
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '20px 0', color: C.muted, fontSize: 12 }}>
                        Nobody has 4+ sessions in this window yet — widen the time range to see improvement trends.
                      </div>
                    )}
                  </Card>
                </div>
              )
            )}

            {tab === 'Agents' && (
              <div>
                <SelectorHealth adminToken={adminToken} />
                <AgentStatus />
              </div>
            )}

            {tab === 'Security' && (
              <div>
                <SecurityPanel events={data?.security_feed ?? []} />
                <div style={{ marginTop: 12 }}>
                  <EventLog events={data?.event_log ?? []} />
                </div>
              </div>
            )}

            {tab === 'Reports' && (
              <div>
                <Card title="📄 Cohort Report" sub="Plain-English summary of what's happening across the cohort — no prompt/response content, ever" style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 10, color: C.gray, fontWeight: 600 }}>REPORT PERIOD</span>
                    <div style={{ display: 'flex', gap: 3 }} role="group" aria-label="Report period">
                      {[[1, 'Daily'], [7, 'Weekly'], [days !== 1 && days !== 7 ? days : 30, `Custom (${days !== 1 && days !== 7 ? days : 30}d)`]].map(([d, label]) => (
                        <button key={label} onClick={() => setDays(d)}
                          style={{ padding: '4px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', border: `0.5px solid ${days === d ? C.garnet : C.border}`, background: days === d ? C.garnet : C.bg, color: days === d ? '#fff' : C.gray, fontWeight: days === d ? 600 : 400 }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <span style={{ fontSize: 10, color: C.muted }}>— also sets the TIME RANGE for the rest of the dashboard, so the report matches exactly what's shown.</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 3 }} role="group" aria-label="Report detail level">
                      {[['executive', 'Executive Summary'], ['detailed', 'Detailed Report']].map(([m, label]) => (
                        <button key={m} onClick={() => setReportMode(m)}
                          style={{ flex: isMobile ? 1 : 'none', padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', border: `0.5px solid ${reportMode === m ? C.garnet : C.border}`, background: reportMode === m ? C.garnet : C.bg, color: reportMode === m ? '#fff' : C.gray, fontWeight: reportMode === m ? 600 : 400 }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <div style={{ marginLeft: isMobile ? 0 : 'auto', display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'none', gridAutoFlow: isMobile ? 'row' : 'column', gap: 8 }}>
                      <button onClick={() => downloadReportPDF(report, `castmir-cohort-${reportMode}-report.pdf`)}
                        style={{ background: C.garnet, color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        ↓ Download PDF
                      </button>
                      <button disabled={slidesBusy} onClick={async () => {
                          setSlidesBusy(true)
                          try { await downloadAdminReportSlides(report, data, `castmir-cohort-${reportMode}-report.pptx`) }
                          finally { setSlidesBusy(false) }
                        }}
                        style={{ background: C.amber, color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: slidesBusy ? 'not-allowed' : 'pointer', opacity: slidesBusy ? 0.7 : 1 }}>
                        {slidesBusy ? '⟳ Building slides…' : '↓ Download Slides'}
                      </button>
                      <button onClick={() => downloadReportHTML(report, {
                          bars: { label: 'Tool accuracy', items: (data?.tool_comparison ?? []).map(t => ({ label: t.tool, value: Math.round(t.avg_quality || 0) })) },
                          pie: { label: 'Drift type distribution', items: (data?.drift_events ?? []).map(d => ({ label: d.drift_type, value: d.n })) },
                        }, `castmir-cohort-${reportMode}-report.html`)}
                        style={{ background: C.navy, color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        ↓ Download HTML
                      </button>
                      <button onClick={() => downloadText(reportToMarkdown(report), `castmir-cohort-${reportMode}-report.md`, 'text/markdown;charset=utf-8;')}
                        style={{ background: C.bg, color: C.dark, border: `0.5px solid ${C.border}`, borderRadius: 7, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        ↓ Download Text
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

                <Card title="Export research data" sub="Metrics only — aggregated, never prompt/response content">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {[
                      { label: 'Tool comparison summary', fmt: 'CSV', fn: () => downloadCSV(data?.tool_comparison ?? [], 'castmir-tool-comparison.csv') },
                      { label: 'User activity (by alias)', fmt: 'CSV', fn: () => downloadCSV(data?.user_activity ?? [], 'castmir-user-activity.csv') },
                      { label: 'Drift events log', fmt: 'JSON', fn: () => downloadJSON(data?.drift_events ?? [], 'castmir-drift-events.json') },
                      { label: 'Security event feed (no OCSF payload)', fmt: 'CSV', fn: () => downloadCSV((data?.security_feed ?? []).map(({ ocsf_payload, ...rest }) => rest), 'castmir-security-feed.csv') },
                      { label: 'Day-to-day event log', fmt: 'CSV', fn: () => downloadCSV(data?.event_log ?? [], 'castmir-event-log.csv') },
                      { label: 'Prompting improvement (by alias)', fmt: 'CSV', fn: () => downloadCSV(data?.user_improvement ?? [], 'castmir-user-improvement.csv') },
                    ].map((e, i) => (
                      <div key={i} onClick={e.fn} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', borderRadius: 9, border: `0.5px solid ${C.border}`, cursor: 'pointer', background: C.bg, transition: 'background 0.15s' }}
                        onMouseOver={ev => ev.currentTarget.style.background = C.light}
                        onMouseOut={ev => ev.currentTarget.style.background = C.bg}>
                        <span style={{ fontSize: 13, color: C.dark }}>↓ {e.label}</span>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: C.light, color: C.gray }}>{e.fmt}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
