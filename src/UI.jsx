/**
 * PRISM — Shared UI Components
 * PrismBar · KPI · Card · Pill · Table · ChartTip · AccBar · Counter · useVisible
 */
import { useState, useEffect, useRef } from 'react'
import { C } from './constants.js'

// ── Scroll visibility hook ────────────────────────────────────────
export function useVisible(threshold = 0.12) {
  const ref = useRef(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect() } },
      { threshold }
    )
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, v]
}

// ── Animated counter ──────────────────────────────────────────────
export function Counter({ end, suffix = '', duration = 2200, active = false }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!active) return
    let t0 = null
    const step = ts => {
      if (!t0) t0 = ts
      const p = Math.min((ts - t0) / duration, 1)
      setVal(Math.floor((1 - Math.pow(1 - p, 3)) * end))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [active, end, duration])
  return <>{val.toLocaleString()}{suffix}</>
}

// ── Prismatic gradient bar ────────────────────────────────────────
export function PrismBar({ h = 4, onClick }) {
  return (
    <div onClick={onClick} style={{
      height: h, cursor: onClick ? 'pointer' : 'default',
      background: `linear-gradient(90deg,${C.garnet} 0%,#0D7377 25%,${C.navy} 50%,${C.amber} 75%,${C.purple} 100%)`,
    }} />
  )
}

// ── KPI card ──────────────────────────────────────────────────────
export function KPI({ label, value, sub, color, trend }) {
  return (
    <div style={{
      background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12,
      padding: '14px 16px', borderTop: `3px solid ${color}`, flex: 1, minWidth: 0,
    }}>
      <div style={{ fontSize: 10, color: C.gray, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: C.dark, letterSpacing: -0.5 }}>{value ?? '—'}</div>
      {(sub || trend != null) && (
        <div style={{ fontSize: 10, color: C.gray, marginTop: 3 }}>
          {trend != null && (
            <span style={{ color: trend >= 0 ? C.green : C.red, fontWeight: 700, marginRight: 4 }}>
              {trend >= 0 ? '▲' : '▼'}{Math.abs(trend)}%
            </span>
          )}
          {sub}
        </div>
      )}
    </div>
  )
}

// ── Card container ────────────────────────────────────────────────
export function Card({ title, sub, style = {}, children }) {
  return (
    <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 18, ...style }}>
      {title && <div style={{ fontWeight: 700, fontSize: 13, color: C.dark, marginBottom: sub ? 2 : 14 }}>{title}</div>}
      {sub   && <div style={{ fontSize: 10, color: C.gray, marginBottom: 12 }}>{sub}</div>}
      {children}
    </div>
  )
}

// ── Label pill ────────────────────────────────────────────────────
export function Pill({ label, color, bg, style = {} }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 10, fontSize: 10,
      fontWeight: 600, color, background: bg, whiteSpace: 'nowrap', ...style,
    }}>
      {label}
    </span>
  )
}

// ── Recharts tooltip ──────────────────────────────────────────────
export function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.dark, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.gray, marginTop: 2 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
          <span>{p.name}:</span>
          <strong style={{ color: C.dark }}>
            {typeof p.value === 'number' && p.value > 0 && p.value <= 100
              ? `${p.value}%`
              : p.value?.toLocaleString?.() ?? p.value}
          </strong>
        </div>
      ))}
    </div>
  )
}

// ── Accuracy bar ──────────────────────────────────────────────────
export function AccBar({ value }) {
  const color = value >= 90 ? C.green : value >= 82 ? C.amber : C.red
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 60, height: 5, background: C.light, borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ height: '100%', background: color, width: `${value}%`, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}%</span>
    </div>
  )
}

// ── Table shell ───────────────────────────────────────────────────
export function Table({ headers, maxH, children }) {
  return (
    <div style={{ overflowX: 'auto', ...(maxH ? { maxHeight: maxH, overflowY: 'auto' } : {}) }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: C.light }}>
            {headers.map(h => (
              <th key={h} style={{
                padding: '7px 12px', textAlign: 'left', fontSize: 10,
                fontWeight: 600, color: C.gray, textTransform: 'uppercase',
                letterSpacing: 0.5, whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function TR({ children, onClick }) {
  return (
    <tr
      style={{ borderBottom: `0.5px solid ${C.border}`, cursor: onClick ? 'pointer' : 'default' }}
      onMouseOver={e => { if (onClick) e.currentTarget.style.background = C.light }}
      onMouseOut={e => { e.currentTarget.style.background = '' }}
      onClick={onClick}
    >
      {children}
    </tr>
  )
}

export function TD({ children, style = {} }) {
  return (
    <td style={{ padding: '9px 12px', fontSize: 12, color: C.dark, ...style }}>
      {children}
    </td>
  )
}
