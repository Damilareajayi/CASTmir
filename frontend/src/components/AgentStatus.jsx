import { AGENT_DEFS, C } from '../constants.js'
import { useIsMobile } from './UI.jsx'

export default function AgentStatus() {
  const isMobile = useIsMobile()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4,1fr)', gap: 12 }}>
      {AGENT_DEFS.map((a, i) => (
        <div key={i} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderLeft: `4px solid ${a.color}`, borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 12, color: C.dark }}>{a.icon} {a.name}</div>
              <div style={{ fontSize: 10, color: C.gray }}>{a.role} · {a.tagline}</div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: C.gray, lineHeight: 1.55, marginBottom: 10 }}>{a.desc}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {a.signals.map((s, j) => (
              <span key={j} style={{ fontSize: 9, color: a.color, background: a.colorL, padding: '2px 7px', borderRadius: 8, fontWeight: 600 }}>{s}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
