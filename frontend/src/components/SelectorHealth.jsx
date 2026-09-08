import { useState, useEffect } from 'react'
import { C } from '../constants.js'
import { getSelectorHealth } from '../api.js'
import { Card, Table, TR, TD, Pill } from './UI.jsx'

// A dropping found-rate here means a supported AI site changed its DOM and
// broke content.js's promptInput selector for it — this is what turns that
// from "someone eventually notices capture stopped working" into a signal
// that shows up here automatically. Fix via PUT /api/admin/site-configs/
// {hostname} (see routers/site_configs.py) — takes effect for installed
// extensions within one background.js refresh cycle, no new release needed.
export default function SelectorHealth({ adminToken }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getSelectorHealth(24, adminToken).then(setRows).catch(e => setError(e.message))
  }, [adminToken])

  return (
    <Card title="Extension health — selector detection" sub="Whether content.js actually found the prompt input on each site, last 24h. A low found-rate means that site's DOM likely changed — 'fallback' means capture still works via generic detection, but the specific selector needs fixing." style={{ marginBottom: 12 }}>
      {error ? (
        <div style={{ textAlign: 'center', padding: '16px 0', color: C.red, fontSize: 12 }}>{error}</div>
      ) : (
        <Table headers={['Site', 'Tool', 'Found rate', 'Detection', 'Checks', 'Last checked']}>
          {(rows ?? []).map((r, i) => {
            const pct = r.found_rate != null ? Math.round(r.found_rate * 100) : null
            const color = pct == null ? C.gray : pct >= 95 ? C.green : pct >= 70 ? C.amber : C.red
            const viaGeneric = r.via_generic ?? 0
            return (
              <TR key={i}>
                <TD><strong>{r.hostname}</strong></TD>
                <TD style={{ color: C.gray }}>{r.tool ?? '—'}</TD>
                <TD><Pill label={pct != null ? `${pct}%` : '—'} color={color} bg={`${color}22`} /></TD>
                <TD>
                  {viaGeneric > 0
                    ? <Pill label={`fallback (${viaGeneric}/${r.checks})`} color={C.amber} bg={`${C.amber}22`} />
                    : <span style={{ color: C.muted, fontSize: 11 }}>selector OK</span>}
                </TD>
                <TD style={{ color: C.gray }}>{r.checks}</TD>
                <TD style={{ color: C.muted }}>{r.last_checked_at ? new Date(r.last_checked_at).toLocaleString() : '—'}</TD>
              </TR>
            )
          })}
        </Table>
      )}
      {rows && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '16px 0', color: C.muted, fontSize: 12 }}>No health pings in the last 24h yet.</div>
      )}
    </Card>
  )
}
