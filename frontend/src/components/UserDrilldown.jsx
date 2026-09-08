import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { C } from '../constants.js'
import { getAdminUserDashboard } from '../api.js'
import { Card, KPI, Table, TR, TD, ChartTip, useIsMobile } from './UI.jsx'
import SecurityPanel from './SecurityPanel.jsx'

/** Admin drill-down into one person (by alias, aggregated across their
 * devices) — reached by clicking a row in the admin Users tab. Same shape
 * as the private user dashboard, but admin never needs to know the
 * person's private user_hash to reach it; the backend resolves alias ->
 * hashes server-side (see admin_user_dashboard in agents/reporter.py). */
export default function UserDrilldown({ identity, days, adminToken, onBack }) {
  const isMobile = useIsMobile()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    setLoading(true); setError(null)
    getAdminUserDashboard(identity, days, adminToken)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [identity, days, adminToken])

  useEffect(() => { load() }, [load])

  const qualities = data?.quality_trend?.map(r => r.quality).filter(v => v != null) ?? []
  const pmis = data?.pmi_trend?.map(r => r.pmi).filter(v => v != null) ?? []
  const totalSessions = data?.tool_breakdown?.reduce((s, t) => s + t.sessions, 0) ?? 0
  const activeAlerts = data?.security_events?.filter(e => e.status === 'active').length ?? 0

  const qualitySeries = (data?.quality_trend ?? []).map(r => ({ date: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), quality: r.quality }))
  const pmiSeries = (data?.pmi_trend ?? []).map(r => ({ date: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), pmi: r.pmi }))

  return (
    <div>
      <button onClick={onBack} style={{ marginBottom: 12, background: 'none', border: `0.5px solid ${C.border}`, borderRadius: 6, padding: '5px 12px', color: C.gray, fontSize: 12, cursor: 'pointer' }}>
        ← Back to all users
      </button>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: C.garnet }}>{identity}</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{data?.devices ?? '—'} device{data?.devices === 1 ? '' : 's'} · metrics only, never prompt/response content</div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted }}>Loading…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.red }}>{error}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
            <KPI label="Avg quality" value={qualities.length ? `${Math.round(qualities.reduce((a, b) => a + b, 0) / qualities.length)}%` : '—'} color={C.garnet} />
            <KPI label="Avg PMI" value={pmis.length ? (pmis.reduce((a, b) => a + b, 0) / pmis.length).toFixed(1) : '—'} sub="/5" color={C.navy} />
            <KPI label={`Sessions (${days}d)`} value={totalSessions} color={C.teal} />
            <KPI label="Active alerts" value={activeAlerts} color={activeAlerts > 0 ? C.red : C.green} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Card title="Quality trend" sub={`Score per day, last ${days} days`}>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={qualitySeries} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Line type="monotone" dataKey="quality" stroke={C.garnet} strokeWidth={2} dot={false} name="Quality" />
                </LineChart>
              </ResponsiveContainer>
            </Card>
            <Card title="PMI growth" sub="Prompt Maturity Index">
              <ResponsiveContainer width="100%" height={180}>
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

          <Card title="Tool usage — model by model" sub="Which AI tools this person uses, and how well each performs for them" style={{ marginBottom: 12 }}>
            <Table headers={['Tool', 'Sessions', 'Avg quality']}>
              {(data?.tool_breakdown ?? []).map((t, i) => (
                <TR key={i}>
                  <TD><strong>{t.tool}</strong></TD>
                  <TD style={{ color: C.gray }}>{t.sessions}</TD>
                  <TD>{t.avg_quality != null ? `${Math.round(t.avg_quality)}%` : '—'}</TD>
                </TR>
              ))}
            </Table>
            {(!data?.tool_breakdown || data.tool_breakdown.length === 0) && (
              <div style={{ textAlign: 'center', padding: '16px 0', color: C.muted, fontSize: 12 }}>No tool usage yet.</div>
            )}
          </Card>

          <Card title="Recent sessions" style={{ marginBottom: 12 }}>
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
              <div style={{ textAlign: 'center', padding: '16px 0', color: C.muted, fontSize: 12 }}>No sessions yet.</div>
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
              <div style={{ textAlign: 'center', padding: '16px 0', color: C.muted, fontSize: 12 }}>No suggestions yet.</div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
