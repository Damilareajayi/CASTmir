import { useState } from 'react'
import { C, SEVERITY_COLOR } from '../constants.js'
import { Card, Table, TR, TD, Pill } from './UI.jsx'
import { downloadJSON } from '../report.js'

// low/medium/high/critical (the real stored severity, used for OCSF and
// everything else) collapses to three buckets for display, per the ask:
// "threat levels in low, mid, and high" with the high bucket calling for
// visible attention — critical folds into "high" rather than adding a
// fourth tier nobody asked for.
function bucketOf(severity) {
  if (severity === 'high' || severity === 'critical') return 'high'
  if (severity === 'medium') return 'mid'
  if (severity === 'low') return 'low'
  return 'low'
}
const BUCKET_COLOR = { low: C.teal, mid: C.amber, high: C.red }

// The content-based path's own LLM reasoning, or the behavioral path's
// deterministic feature-based explanation (see security/classifier.py's
// _justify()) — either way this is finding.desc in the OCSF payload,
// carried through so "why was this flagged" is visible without opening
// the raw JSON.
function justificationOf(e) {
  return e.ocsf_payload?.finding?.desc || null
}

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

  // ocsf_payload is only ever present on the admin side of the privacy
  // boundary — user_dashboard()'s own query never selects it (see
  // agents/reporter.py) — so this naturally stays absent on the private
  // user dashboard without needing a separate flag to check.
  const hasOcsf = events.some(e => e.ocsf_payload)
  const activeHigh = events.filter(e => e.status === 'active' && bucketOf(e.severity) === 'high')

  return (
    <Card title="Security events (OCSF)" sub="Findings from Agent 2's threat classifier — Track 2">
      {activeHigh.length > 0 && (
        <div style={{ background: C.redL, border: `1px solid ${C.red}44`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: C.red, marginBottom: 8 }}>
            ⚠ {activeHigh.length} high-severity alert{activeHigh.length === 1 ? '' : 's'} need review
          </div>
          {activeHigh.slice(0, 5).map((e, i) => (
            <div key={e.event_id || i} style={{ fontSize: 11, color: '#7A2118', lineHeight: 1.6, marginBottom: 4 }}>
              <strong>{e.threat_type?.replace(/_/g, ' ')}</strong>
              {justificationOf(e) ? ` — ${justificationOf(e)}` : ' — no detailed justification available for this finding.'}
            </div>
          ))}
        </div>
      )}

      {hasOcsf && (
        <div style={{ marginBottom: 12, textAlign: 'right' }}>
          <button
            onClick={() => downloadJSON(events.map(e => e.ocsf_payload).filter(Boolean), 'castmir-ocsf-events.json')}
            style={{ fontSize: 11, border: `0.5px solid ${C.border}`, background: C.bg, borderRadius: 7, padding: '6px 12px', cursor: 'pointer', color: C.dark, fontWeight: 600 }}>
            ↓ Download OCSF events (JSON)
          </button>
        </div>
      )}

      <Table headers={['Level', 'Threat type', 'Confidence', 'Status', 'Detected', '']}>
        {events.map((e, i) => {
          const sc = SEVERITY_COLOR[e.severity] || C.gray
          const bucket = bucketOf(e.severity)
          const bc = BUCKET_COLOR[bucket]
          const justification = justificationOf(e)
          return (
            <TR key={e.event_id || i}>
              <TD>
                <Pill label={bucket.toUpperCase()} color={bc} bg={`${bc}18`} />
                {bucket === 'high' && (
                  <span style={{ marginLeft: 5, fontSize: 9, color: C.gray }} title={e.severity}>({e.severity})</span>
                )}
              </TD>
              <TD style={{ fontWeight: 500 }}>
                {e.threat_type?.replace(/_/g, ' ')}
                {bucket === 'high' && justification && (
                  <div style={{ fontSize: 10, color: C.gray, fontWeight: 400, marginTop: 3, maxWidth: 320, lineHeight: 1.5 }}>{justification}</div>
                )}
              </TD>
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
