import { useState } from 'react'
import { C, SEVERITY_COLOR } from '../constants.js'
import { Card, Table, TR, TD, Pill } from './UI.jsx'

function OcsfDetail({ payload, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 12, padding: 20, maxWidth: 560, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.dark }}>OCSF Security Finding</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: C.gray }}>×</button>
        </div>
        <pre style={{ fontSize: 11, background: C.bg, borderRadius: 8, padding: 12, overflowX: 'auto', color: C.dark }}>
          {JSON.stringify(payload, null, 2)}
        </pre>
      </div>
    </div>
  )
}

export default function SecurityPanel({ events = [] }) {
  const [detail, setDetail] = useState(null)

  return (
    <Card title="Security events (OCSF)" sub="Findings from Agent 2's threat classifier — Track 2">
      <Table headers={['Severity', 'Threat type', 'Confidence', 'Status', 'Detected', '']}>
        {events.map((e, i) => {
          const sc = SEVERITY_COLOR[e.severity] || C.gray
          return (
            <TR key={e.event_id || i}>
              <TD><Pill label={e.severity?.toUpperCase()} color={sc} bg={`${sc}18`} /></TD>
              <TD style={{ fontWeight: 500 }}>{e.threat_type?.replace(/_/g, ' ')}</TD>
              <TD style={{ color: C.gray }}>{(e.confidence * 100).toFixed(0)}%</TD>
              <TD><Pill label={e.status} color={e.status === 'active' ? C.red : C.green} bg={e.status === 'active' ? C.redL : C.greenL} /></TD>
              <TD style={{ color: C.muted }}>{e.detected_at ? new Date(e.detected_at).toLocaleString() : '—'}</TD>
              <TD>
                {e.ocsf_payload && (
                  <button onClick={() => setDetail(e.ocsf_payload)} style={{ fontSize: 10, border: `0.5px solid ${C.border}`, background: C.bg, borderRadius: 5, padding: '3px 8px', cursor: 'pointer', color: C.gray }}>
                    View OCSF
                  </button>
                )}
              </TD>
            </TR>
          )
        })}
      </Table>
      {events.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 12 }}>No security events in this window.</div>
      )}
      {detail && <OcsfDetail payload={detail} onClose={() => setDetail(null)} />}
    </Card>
  )
}
