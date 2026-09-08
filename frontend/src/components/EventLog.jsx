import { C } from '../constants.js'
import { Card, Pill } from './UI.jsx'

const KIND_COLOR = { security: C.red, drift: C.amber }

// Groups a flat, already-sorted event list by calendar day (in the
// viewer's own local time, same as every other date shown on this
// dashboard) — "day to day event log" as its own scannable list, distinct
// from the aggregate trend charts elsewhere on this tab.
function groupByDay(events) {
  const groups = []
  let current = null
  for (const e of events) {
    const key = new Date(e.ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    if (!current || current.key !== key) {
      current = { key, items: [] }
      groups.push(current)
    }
    current.items.push(e)
  }
  return groups
}

export default function EventLog({ events = [] }) {
  const groups = groupByDay(events)

  return (
    <Card title="Day-to-day event log" sub="Security findings and performance drift, chronologically — everything CASTmir flagged, grouped by day.">
      {groups.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: C.muted, fontSize: 12 }}>Nothing logged in this window.</div>
      )}
      {groups.map((g, gi) => (
        <div key={gi} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, paddingBottom: 4, borderBottom: `0.5px solid ${C.border}` }}>
            {g.key} <span style={{ fontWeight: 400, color: C.muted }}>· {g.items.length} event{g.items.length === 1 ? '' : 's'}</span>
          </div>
          {g.items.map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 2px', fontSize: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: KIND_COLOR[e.kind] || C.gray, flexShrink: 0 }} />
              <span style={{ color: C.muted, fontSize: 10, minWidth: 58 }}>{new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <Pill label={e.kind} color={KIND_COLOR[e.kind] || C.gray} bg={`${KIND_COLOR[e.kind] || C.gray}18`} />
              <span style={{ color: C.dark, fontWeight: 500 }}>{e.label?.replace(/_/g, ' ')}</span>
              {e.severity && <span style={{ color: C.gray, fontSize: 10 }}>({e.severity})</span>}
              {e.confidence != null && <span style={{ color: C.muted, fontSize: 10 }}>{(e.confidence * 100).toFixed(0)}% confidence</span>}
            </div>
          ))}
        </div>
      ))}
    </Card>
  )
}
