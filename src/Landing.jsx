/**
 * CASTmir — Landing Page
 * All imports are from the same src/ folder.
 */
import { useState, useEffect } from 'react'
import { C, AGENT_DEFS, FSU_COLLEGES } from './constants.js'
import { CastmirBar, Counter, useVisible, useIsMobile } from './UI.jsx'

// ── Sticky nav ────────────────────────────────────────────────────
function Nav({ onEnter }) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const isMobile = useIsMobile()
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])
  useEffect(() => { setMenuOpen(false) }, [isMobile])

  const solid    = scrolled || menuOpen
  const fg       = solid ? '#fff' : C.dark
  const fgSub    = solid ? C.gold : C.garnet
  const linkFg   = solid ? 'rgba(255,255,255,0.8)' : C.gray
  const hoverBg  = solid ? 'rgba(255,255,255,0.12)' : 'rgba(120,47,64,0.08)'
  const links    = ['Features','Research','Use Cases','About']

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: solid ? 'rgba(120,47,64,0.97)' : 'transparent',
      backdropFilter: solid ? 'blur(12px)' : 'none',
      transition: 'background 0.3s', padding: '0 5%',
      borderBottom: solid ? '1px solid rgba(255,255,255,0.1)' : 'none',
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', height:64 }}>
        <div onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setMenuOpen(false) }} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <img src='/mascot-head.png' alt='CASTmir mascot' style={{ width: 38, height: 38, objectFit: 'contain' }} />
          <div>
            <div style={{ color: fg, fontWeight: 800, fontSize: 20, letterSpacing: 3, transition:'color 0.3s' }}>CASTmir</div>
            <div style={{ color: fgSub, fontSize: 8, letterSpacing: 1, marginTop: -3, transition:'color 0.3s' }}>AI PERFORMANCE INTELLIGENCE</div>
          </div>
        </div>

        {isMobile ? (
          <button aria-label='Menu' onClick={() => setMenuOpen(o => !o)}
            style={{ background:'transparent', border:'none', cursor:'pointer', padding:8, display:'flex', flexDirection:'column', gap:4 }}>
            {[0,1,2].map(i => (
              <span key={i} style={{
                width:22, height:2, background:fg, borderRadius:2, transition:'all 0.25s',
                transform: menuOpen ? (i===0?'translateY(6px) rotate(45deg)':i===2?'translateY(-6px) rotate(-45deg)':'scaleX(0)') : 'none',
              }} />
            ))}
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {links.map(l => (
              <a key={l} href={`#${l.toLowerCase().replace(' ','-')}`}
                style={{ color:linkFg, fontSize:13, textDecoration:'none', padding:'6px 12px', borderRadius:6, transition:'background 0.15s, color 0.3s' }}
                onMouseOver={e => e.target.style.background=hoverBg}
                onMouseOut={e  => e.target.style.background='transparent'}>
                {l}
              </a>
            ))}
            <button onClick={onEnter} style={{ background:C.garnet, color:'#fff', border:'none', borderRadius:8, padding:'8px 20px', fontSize:13, fontWeight:700, cursor:'pointer', marginLeft:4 }}>
              Open Dashboard →
            </button>
          </div>
        )}
      </div>

      {isMobile && (
        <div style={{
          maxHeight: menuOpen ? 320 : 0, overflow:'hidden', transition:'max-height 0.3s ease',
          display:'flex', flexDirection:'column', gap:2, paddingBottom: menuOpen ? 14 : 0,
        }}>
          {links.map(l => (
            <a key={l} href={`#${l.toLowerCase().replace(' ','-')}`} onClick={() => setMenuOpen(false)}
              style={{ color:'rgba(255,255,255,0.85)', fontSize:15, textDecoration:'none', padding:'12px 8px', borderRadius:6 }}>
              {l}
            </a>
          ))}
          <button onClick={() => { setMenuOpen(false); onEnter() }} style={{ background:C.gold, color:C.garnetD, border:'none', borderRadius:8, padding:'12px 20px', fontSize:14, fontWeight:700, cursor:'pointer', marginTop:8 }}>
            Open Dashboard →
          </button>
        </div>
      )}
    </nav>
  )
}

// ── Circuit-board background (high-tech accent layer) ──────────────
// Kept deliberately minimal — a handful of slow, quiet beams tucked
// behind the mascot, not a wall of competing animation.
const CIRCUIT_PATHS = [
  { d:'M 900 60 L 900 180 L 830 250 L 830 380', dur:9 },
  { d:'M 760 480 L 840 400 L 840 300',           dur:10, delay:2 },
  { d:'M 640 30 L 640 110',                       dur:7,  delay:4 },
]

function CircuitBackground() {
  return (
    <svg viewBox='0 0 960 700' preserveAspectRatio='xMidYMid slice'
      style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', opacity:0.4 }}>
      <defs>
        <filter id='beamGlow' x='-200%' y='-200%' width='500%' height='500%'>
          <feGaussianBlur stdDeviation='3.5' result='blur' />
          <feMerge>
            <feMergeNode in='blur' />
            <feMergeNode in='SourceGraphic' />
          </feMerge>
        </filter>
      </defs>

      {/* Faint static wires */}
      {CIRCUIT_PATHS.map((p,i) => (
        <path key={i} d={p.d} fill='none' stroke={C.garnet} strokeWidth={1.2} strokeLinecap='round' strokeOpacity={0.14} />
      ))}

      {/* Traveling light beams — a slow, soft ember riding each wire */}
      {CIRCUIT_PATHS.map((p,i) => (
        <g key={`beam-${i}`} filter='url(#beamGlow)' opacity={0.6}>
          <circle r={2.6} fill={C.garnet}>
            <animateMotion dur={`${p.dur}s`} begin={`${p.delay||0}s`} repeatCount='indefinite' path={p.d} />
          </circle>
          <circle r={1} fill='#fff'>
            <animateMotion dur={`${p.dur}s`} begin={`${p.delay||0}s`} repeatCount='indefinite' path={p.d} />
          </circle>
        </g>
      ))}
    </svg>
  )
}

// ── Hero ──────────────────────────────────────────────────────────
function Hero({ onEnter }) {
  const [idx, setIdx] = useState(0)
  const isMobile = useIsMobile()
  const lines = [
    'Track AI accuracy degradation before it impacts your institution.',
    "Diagnose whether it's model drift, prompt drift, or context drift.",
    'Deliver autonomous corrections powered by AWS Bedrock.',
    'Built on Self-Directed Learning theory. Grounded in research.',
  ]
  const words = ['degrade', 'drift', 'go stale', 'lose accuracy']
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % lines.length), 3400)
    return () => clearInterval(t)
  }, [])

  return (
    <section style={{
      minHeight:'100vh',
      background:`linear-gradient(135deg,#FFFFFF 0%,${C.goldL} 55%,${C.light} 100%)`,
      display:'flex', flexDirection: isMobile ? 'column' : 'row', alignItems:'center',
      padding: isMobile ? '96px 6% 40px' : '80px 5% 40px', gap: isMobile ? 32 : 0,
      position:'relative', overflow:'hidden',
    }}>
      <div style={{ position:'absolute', inset:0, pointerEvents:'none',
        background:'radial-gradient(circle at 20% 50%,rgba(120,47,64,0.05) 0%,transparent 50%),radial-gradient(circle at 80% 20%,rgba(13,115,119,0.07) 0%,transparent 40%)' }} />

      <CircuitBackground />

      {/* Floating particles */}
      {Array.from({ length: 6 }).map((_, i) => {
        const size = [6,8,5,7,6,9][i]
        return (
          <div key={i} style={{
            position:'absolute', borderRadius:'50%',
            width:size, height:size,
            background:`rgba(120,47,64,${[0.18,0.12,0.22,0.14,0.2,0.12][i]})`,
            top:`${[15,45,70,25,60,80][i]}%`,
            left:`${[10,85,15,60,40,75][i]}%`,
            animation:`float ${[3,4,3.5,5,4,3.8][i]}s ease-in-out infinite`,
            animationDelay:`${(i * 0.5).toFixed(2)}s`,
          }} />
        )
      })}

      {/* Copy */}
      <div style={{ flex:1, maxWidth: isMobile ? '100%' : 600, textAlign: isMobile ? 'center' : 'left', position:'relative', zIndex:2 }}>
        <h1 style={{ fontSize:'clamp(30px,5vw,58px)', fontWeight:800, color:C.dark, lineHeight:1.15, marginBottom:20, marginTop:0, letterSpacing:-1 }}>
          AI performance<br />
          doesn't{' '}
          <span key={idx} style={{ display:'inline-block', color:C.teal, animation:'fadeUp 0.5s ease' }}>{words[idx]}</span><br />
          in silence anymore.
        </h1>

        <div style={{ height:52, position:'relative', overflow:'hidden', marginBottom:24 }}>
          {lines.map((t,i) => (
            <p key={i} style={{
              fontSize: isMobile ? 14 : 16, color:C.gray, lineHeight:1.6,
              position:'absolute', top:0, width:'100%',
              opacity:idx===i?1:0, transform:`translateY(${idx===i?0:16}px)`,
              transition:'all 0.5s ease',
            }}>{t}</p>
          ))}
        </div>

        <p style={{ fontSize:15, color:C.gray, marginBottom:36, lineHeight:1.7 }}>
          CASTmir monitors every AI interaction across your institution, classifies degradation to its root cause, and autonomously delivers corrections — powered by AWS Bedrock and grounded in Self-Directed Learning research.
        </p>

        <div style={{ display:'flex', gap:12, flexWrap:'wrap', justifyContent: isMobile ? 'center' : 'flex-start' }}>
          <button onClick={onEnter} style={{ background:C.garnet, color:'#fff', border:'none', borderRadius:10, padding:'14px 32px', fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 8px 24px rgba(120,47,64,0.25)', transition:'all 0.2s' }}
            onMouseOver={e=>{e.target.style.transform='translateY(-2px)';e.target.style.boxShadow='0 12px 32px rgba(120,47,64,0.35)'}}
            onMouseOut={e=>{e.target.style.transform='';e.target.style.boxShadow='0 8px 24px rgba(120,47,64,0.25)'}}>
            Launch Dashboard →
          </button>
          <a href='#features' style={{ background:'#fff', color:C.dark, border:`1px solid ${C.border}`, borderRadius:10, padding:'14px 28px', fontSize:15, fontWeight:500, textDecoration:'none' }}>
            See how it works ↓
          </a>
        </div>

        <div style={{ display:'flex', gap: isMobile ? 24 : 36, marginTop:48, justifyContent: isMobile ? 'center' : 'flex-start', flexWrap:'wrap' }}>
          {[['17','FSU colleges in pilot'],['4','autonomous AI agents'],['3','drift types classified']].map(([n,l])=>(
            <div key={l}>
              <div style={{ fontSize:30, fontWeight:800, color:C.garnet }}>{n}</div>
              <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Hero mascot */}
      <div style={{ flex:1, display:'flex', justifyContent:'center', alignItems: isMobile ? 'center' : 'flex-end', position:'relative', zIndex:2 }}>
        <div style={{ position:'relative', maxWidth: isMobile ? '42vw' : 'min(300px,28vw)', width:'100%' }}>
          <div style={{ position:'absolute', left:'50%', bottom:-6, width:'70%', aspectRatio:'3.2/1', background:'radial-gradient(ellipse at center, rgba(20,10,15,0.4) 0%, rgba(20,10,15,0) 72%)', borderRadius:'50%', transform:'translateX(-50%)', animation:'heroShadow 2.6s ease-in-out infinite' }} />
          <img src='/mascot-clean.png' alt='CASTmir mascot'
            style={{ width:'100%', objectFit:'contain', position:'relative',
              filter:'drop-shadow(0 10px 18px rgba(0,0,0,0.12))',
              animation:'heroBounce 2.6s ease-in-out infinite' }} />
        </div>
      </div>
    </section>
  )
}

// ── Stats bar ─────────────────────────────────────────────────────
function StatsBar() {
  const [ref, v] = useVisible(0.3)
  return (
    <div ref={ref} style={{ background:C.dark, padding:'28px 5%' }}>
      <div style={{ display:'flex', justifyContent:'center', gap:'clamp(20px,4vw,72px)', flexWrap:'wrap' }}>
        {[
          { end:1000000, suffix:'+', label:'Conversations analyzed' },
          { end:25,      suffix:'',  label:'AI models tracked'      },
          { end:17,      suffix:'',  label:'FSU colleges covered'   },
          { end:4,       suffix:'',  label:'Autonomous agents'      },
          { end:3,       suffix:'',  label:'Drift types classified' },
        ].map(s=>(
          <div key={s.label} style={{ textAlign:'center' }}>
            <div style={{ fontSize:'clamp(22px,3vw,36px)', fontWeight:800, color:C.gold }}>
              <Counter end={s.end} suffix={s.suffix} active={v} />
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── RECAST Team callout ──────────────────────────────────────────
function RecastCallout() {
  const [ref, v] = useVisible()
  return (
    <section ref={ref} style={{ padding:'64px 5%', background:C.garnetD, textAlign:'center', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', inset:0, pointerEvents:'none',
        background:'radial-gradient(circle at 50% 0%,rgba(206,184,136,0.1) 0%,transparent 55%)' }} />
      <div style={{ maxWidth:620, margin:'0 auto', position:'relative', opacity:v?1:0, transform:v?'none':'translateY(20px)', transition:'all 0.6s' }}>
        <img src='/recast-logo.png' alt='RECAST Team' style={{ width:84, marginBottom:18, filter:'drop-shadow(0 6px 16px rgba(0,0,0,0.25))' }} />
        <div style={{ color:C.gold, fontWeight:700, fontSize:11, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>Built by</div>
        <h3 style={{ fontSize:'clamp(22px,3vw,32px)', fontWeight:800, color:'#fff', marginBottom:14 }}>The RECAST Team</h3>
        <p style={{ fontSize:14, color:'rgba(255,255,255,0.7)', lineHeight:1.75, marginBottom:20 }}>
          CASTmir is developed at the RECAST Lab (Research and Exploration of Context-Aware Self-Teaching), FSU Innovation Hub — studying how people learn through self-directed, context-sensitive engagement with technology.
        </p>
        <p style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:28 }}>
          Powered by the{' '}
          <a href='https://www.reliaquest.com' target='_blank' rel='noopener noreferrer' style={{ color:C.gold, textDecoration:'underline' }}>
            ReliaQuest
          </a>{' '}Innovation Challenge Fund
        </p>
        <a href='https://recast.team' target='_blank' rel='noopener noreferrer'
          style={{ display:'inline-block', background:C.gold, color:C.garnetD, borderRadius:10, padding:'13px 30px', fontSize:14, fontWeight:700, textDecoration:'none', boxShadow:'0 8px 24px rgba(206,184,136,0.25)', transition:'all 0.2s' }}
          onMouseOver={e=>{e.currentTarget.style.transform='translateY(-2px)'}}
          onMouseOut={e=>{e.currentTarget.style.transform=''}}>
          Visit RECAST Team ↗
        </a>
      </div>
    </section>
  )
}

// ── Problem ───────────────────────────────────────────────────────
function Problem() {
  const [ref,v] = useVisible()
  const pains = [
    { icon:'📉', title:'Silent degradation',      color:C.garnet, desc:'Model accuracy erodes from API updates, prompt drift, and shifting contexts — with no signal to administrators.' },
    { icon:'🔍', title:'No root cause visibility', color:C.navy,   desc:"When quality drops, organizations can't distinguish model failure from prompt failure from context failure." },
    { icon:'🔇', title:'No feedback loop',         color:C.amber,  desc:'Users receive no signal about interaction quality and no pathway to improve. The system keeps getting worse.' },
    { icon:'📊', title:"BI tools aren't enough",   color:C.purple, desc:'Power BI reports usage volume. It cannot measure output accuracy, classify degradation, or recommend corrections.' },
  ]
  return (
    <section id='features' ref={ref} style={{ padding:'80px 5%', background:C.bg }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        <div style={{ textAlign:'center', marginBottom:56, opacity:v?1:0, transform:v?'none':'translateY(24px)', transition:'all 0.6s' }}>
          <div style={{ color:C.garnet, fontWeight:700, fontSize:11, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>The problem</div>
          <h2 style={{ fontSize:'clamp(26px,4vw,42px)', fontWeight:800, color:C.dark, lineHeight:1.2, marginBottom:16 }}>
            Your AI tools are degrading.<br /><span style={{ color:C.garnet }}>You just can't see it yet.</span>
          </h2>
          <p style={{ fontSize:16, color:C.gray, maxWidth:580, margin:'0 auto', lineHeight:1.7 }}>
            Institutions deploy AI tools and assume they work. But model accuracy drifts silently — and no one notices until the damage is done.
          </p>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:18 }}>
          {pains.map((p,i)=>(
            <div key={i} style={{ background:'#fff', border:`0.5px solid ${C.border}`, borderRadius:14, padding:'22px 18px', borderTop:`3px solid ${p.color}`, opacity:v?1:0, transform:v?'none':'translateY(24px)', transition:`all 0.6s ${i*0.1}s` }}>
              <div style={{ fontSize:26, marginBottom:12 }}>{p.icon}</div>
              <div style={{ fontWeight:700, fontSize:14, color:C.dark, marginBottom:8 }}>{p.title}</div>
              <div style={{ fontSize:13, color:C.gray, lineHeight:1.65 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Four agents ───────────────────────────────────────────────────
function Agents() {
  const [active, setActive] = useState(0)
  const [ref,v] = useVisible()
  const isMobile = useIsMobile()
  const ag = AGENT_DEFS[active]

  return (
    <section ref={ref} style={{ padding:'80px 5%', background:'#fff' }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        <div style={{ textAlign:'center', marginBottom:48, opacity:v?1:0, transition:'all 0.6s' }}>
          <div style={{ color:C.garnet, fontWeight:700, fontSize:11, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>The solution</div>
          <h2 style={{ fontSize:'clamp(26px,4vw,42px)', fontWeight:800, color:C.dark }}>Four agents. One closed loop.</h2>
          <p style={{ fontSize:15, color:C.gray, marginTop:14, maxWidth:520, margin:'14px auto 0' }}>Each agent owns one function. Together they move from detection to correction automatically.</p>
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:28, flexWrap:'wrap' }}>
          {AGENT_DEFS.map((a,i)=>(
            <button key={i} onClick={()=>setActive(i)} style={{ padding:'9px 18px', borderRadius:40, border:`2px solid ${active===i?a.color:C.border}`, background:active===i?a.color:'#fff', color:active===i?'#fff':C.gray, fontSize:13, fontWeight:600, cursor:'pointer', transition:'all 0.2s' }}>
              {a.icon} {a.name}
            </button>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:28, background:C.bg, borderRadius:20, padding: isMobile ? '26px 20px' : '32px 28px', border:`2px solid ${ag.color}20`, opacity:v?1:0, transition:'all 0.4s' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
              <div style={{ width:48, height:48, borderRadius:12, background:`${ag.color}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>{ag.icon}</div>
              <div>
                <div style={{ fontSize:10, color:ag.color, fontWeight:700, letterSpacing:1 }}>AGENT {ag.num}</div>
                <div style={{ fontSize:18, fontWeight:800, color:C.dark }}>{ag.name}</div>
              </div>
            </div>
            <div style={{ fontSize:14, fontWeight:600, color:ag.color, marginBottom:12 }}>{ag.tagline}</div>
            <p style={{ fontSize:13, color:C.gray, lineHeight:1.7, marginBottom:18 }}>{ag.desc}</p>
            <div style={{ fontSize:11, color:C.muted, padding:'8px 12px', background:`${ag.color}08`, borderRadius:8, borderLeft:`3px solid ${ag.color}` }}>{ag.tech}</div>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:C.gray, textTransform:'uppercase', letterSpacing:1, marginBottom:14 }}>What it tracks</div>
            <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
              {ag.signals.map((s,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'#fff', borderRadius:8, border:`0.5px solid ${C.border}` }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:ag.color, flexShrink:0, display:'inline-block' }} />
                  <span style={{ fontSize:13, color:C.dark }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:36, flexWrap:'wrap' }}>
          {AGENT_DEFS.map((a,i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <button onClick={()=>setActive(i)} style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${a.color}40`, background:active===i?a.color:`${a.color}12`, color:active===i?'#fff':a.color, fontSize:12, fontWeight:700, cursor:'pointer', transition:'all 0.2s' }}>
                {a.icon} {a.name.split(' ')[0]}
              </button>
              {i < AGENT_DEFS.length-1 && <span style={{ color:C.muted, fontSize:20 }}>→</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Research framework ────────────────────────────────────────────
function Research() {
  const [ref,v] = useVisible()
  const [tab, setTab] = useState('sdl')
  const isMobile = useIsMobile()
  const fws = {
    sdl:{
      title:'Self-Directed Learning (SDL)', author:'Garrison, 1997', color:'#0D7377',
      desc:'SDL theory provides the measurement backbone for how users interact with AI tools over time. CASTmir tracks whether users are becoming more self-directed — not just whether the model is accurate.',
      quote:'"Self-directed learning is a process in which individuals take initiative in diagnosing their learning needs, formulating goals, identifying resources, and evaluating outcomes." — Garrison (1997)',
      constructs:[
        { name:'Self-Management',   signal:'Goal-directed queries, structured prompts', metric:'PMI Score (1–5)' },
        { name:'Self-Monitoring',   signal:'Revision loops, prompt refinement',          metric:'Iteration count, session depth' },
        { name:'Self-Motivation',   signal:'Return rate, voluntary use, complexity growth', metric:'Cohort retention curves' },
      ],
    },
    recast:{
      title:'Context-Aware Self-Teaching', author:'RECAST Lab, FSU', color:C.garnet,
      desc:"RECAST's foundational principle: meaningful improvement happens through iterative, context-sensitive adjustment. CASTmir embodies this architecturally — it learns what works in each institution's context.",
      quote:"Developed at the RECAST Lab (Research and Exploration of Context-Aware Self-Teaching), FSU Innovation Hub. The lab studies how people learn through self-directed, context-sensitive engagement with technology.",
      constructs:[
        { name:'Context awareness',    signal:'Institution-specific deployment patterns', metric:'Per-college drift profiles' },
        { name:'Iterative improvement', signal:'COACH intervention + outcome tracking',   metric:'Quality delta post-intervention' },
        { name:'Self-teaching loop',   signal:'System learns which interventions work where', metric:'Intervention effectiveness score' },
      ],
    },
    systems:{
      title:'Systems Thinking', author:'Meadows, 2008', color:C.purple,
      desc:"An institution's AI ecosystem is a system, not a collection of independent tools. Systems thinking allows CASTmir to detect patterns that only become visible when all tools are monitored together.",
      quote:'"A system is a set of elements interconnected in such a way that they produce their own pattern of behavior over time." — Donella Meadows',
      constructs:[
        { name:'Feedback loops',    signal:'Tool migration when one platform degrades', metric:'Cross-tool session shift' },
        { name:'Leverage points',   signal:'Small prompt change → large quality gain',  metric:'PMI vs quality delta' },
        { name:'Emergent patterns', signal:'Cross-college patterns invisible in isolation', metric:'Multi-institution benchmarks' },
      ],
    },
  }
  const fw = fws[tab]

  return (
    <section id='research' ref={ref} style={{ padding:'80px 5%', background:C.bg }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        <div style={{ textAlign:'center', marginBottom:48, opacity:v?1:0, transition:'all 0.6s' }}>
          <div style={{ color:C.garnet, fontWeight:700, fontSize:11, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>Research framework</div>
          <h2 style={{ fontSize:'clamp(26px,4vw,42px)', fontWeight:800, color:C.dark, lineHeight:1.2 }}>
            Built on validated theory,<br />not just engineering.
          </h2>
          <p style={{ fontSize:15, color:C.gray, marginTop:14, maxWidth:560, margin:'14px auto 0' }}>
            CASTmir is the only AI monitoring platform grounded in peer-reviewed learning science — making it a research instrument as well as an institutional tool.
          </p>
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:28, flexWrap:'wrap' }}>
          {Object.entries(fws).map(([k,f])=>(
            <button key={k} onClick={()=>setTab(k)} style={{ padding:'9px 22px', borderRadius:40, fontSize:13, fontWeight:600, cursor:'pointer', border:`2px solid ${tab===k?f.color:C.border}`, background:tab===k?f.color:'#fff', color:tab===k?'#fff':C.gray, transition:'all 0.2s' }}>
              {f.title}
            </button>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.15fr', gap:28, background:'#fff', borderRadius:20, padding: isMobile ? '26px 20px' : '32px 28px', border:`2px solid ${fw.color}20`, opacity:v?1:0, transition:'all 0.4s' }}>
          <div>
            <div style={{ fontSize:10, color:fw.color, fontWeight:700, letterSpacing:1, marginBottom:6 }}>{fw.author.toUpperCase()}</div>
            <h3 style={{ fontSize:20, fontWeight:800, color:C.dark, marginBottom:14 }}>{fw.title}</h3>
            <p style={{ fontSize:13, color:C.gray, lineHeight:1.7, marginBottom:20 }}>{fw.desc}</p>
            <div style={{ padding:'12px 14px', background:`${fw.color}08`, borderRadius:10, borderLeft:`3px solid ${fw.color}`, fontSize:12, color:C.gray, lineHeight:1.6, fontStyle:'italic' }}>{fw.quote}</div>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:C.gray, textTransform:'uppercase', letterSpacing:1, marginBottom:14 }}>How CASTmir applies it</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {fw.constructs.map((c,i)=>(
                <div key={i} style={{ background:C.bg, borderRadius:10, padding:'14px 16px', border:`0.5px solid ${C.border}` }}>
                  <div style={{ fontWeight:700, fontSize:13, color:fw.color, marginBottom:4 }}>{c.name}</div>
                  <div style={{ fontSize:12, color:C.gray, marginBottom:8 }}>{c.signal}</div>
                  <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:20, background:`${fw.color}15`, color:fw.color }}>{c.metric}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Use cases ─────────────────────────────────────────────────────
function UseCases() {
  const [ref,v] = useVisible()
  const [active, setActive] = useState(0)
  const isMobile = useIsMobile()
  const cases = [
    { org:'Universities & Colleges', icon:'🎓', color:C.garnet,
      headline:'Monitor AI accuracy across every department',
      features:['Track Gemini, Copilot, Canvas LTI tools simultaneously','College-level dashboards for deans and CIOs','SDL behavioral metrics for learning researchers','FERPA-compliant exports for IRB research','Cross-college benchmarking and equity analysis'],
      example:'Florida State University · 17 colleges · 44,000+ students · Pilot 2026' },
    { org:'School Districts (K-12)', icon:'🏫', color:C.navy,
      headline:'Ensure AI tools support, not undermine, student learning',
      features:['District-wide AI tool performance monitoring','COPPA-compliant data handling','Teacher vs. student usage pattern analysis','Curriculum alignment signal detection','Clever / ClassLink SSO integration'],
      example:'Designed for Title I districts where AI equity gaps are highest' },
    { org:'Research Institutions', icon:'🔬', color:'#0D7377',
      headline:'Turn AI monitoring into a research instrument',
      features:['Longitudinal SDL behavioral datasets','Prompt Maturity Index (PMI) growth tracking','Cross-institution comparison studies','DBR (Design-Based Research) compatible','Publication-ready anonymized exports'],
      example:'Compatible with AECT, EDUCAUSE, and Computers & Education pipelines' },
    { org:'Enterprises', icon:'🏢', color:C.purple,
      headline:'The same problem at enterprise scale',
      features:['Multi-tool enterprise AI ecosystem monitoring','Department-level accuracy benchmarking','CloudWatch compliance audit trail','Cost optimization across AI model deployments','Autonomous A/B test validation before rollout'],
      example:'Architected for security-conscious environments — AWS Bedrock native' },
  ]
  const c = cases[active]

  return (
    <section id='use-cases' ref={ref} style={{ padding:'80px 5%', background:'#fff' }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        <div style={{ textAlign:'center', marginBottom:48, opacity:v?1:0, transition:'all 0.6s' }}>
          <div style={{ color:C.garnet, fontWeight:700, fontSize:11, letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>Use cases</div>
          <h2 style={{ fontSize:'clamp(26px,4vw,42px)', fontWeight:800, color:C.dark }}>Built for FSU. Designed for everyone.</h2>
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:28, flexWrap:'wrap' }}>
          {cases.map((c,i)=>(
            <button key={i} onClick={()=>setActive(i)} style={{ padding:'9px 18px', borderRadius:40, fontSize:13, fontWeight:600, cursor:'pointer', border:`2px solid ${active===i?c.color:C.border}`, background:active===i?c.color:'#fff', color:active===i?'#fff':C.gray, transition:'all 0.2s' }}>
              {c.icon} {c.org}
            </button>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:28, background:C.bg, borderRadius:20, padding: isMobile ? '26px 20px' : '32px 28px', border:`2px solid ${c.color}20`, opacity:v?1:0, transition:'all 0.4s' }}>
          <div>
            <div style={{ fontSize:28, marginBottom:14 }}>{c.icon}</div>
            <h3 style={{ fontSize:20, fontWeight:800, color:C.dark, marginBottom:16 }}>{c.headline}</h3>
            <div style={{ fontSize:12, color:C.muted, padding:'8px 12px', background:`${c.color}08`, borderRadius:8, borderLeft:`3px solid ${c.color}`, fontStyle:'italic' }}>{c.example}</div>
          </div>
          <div>
            {c.features.map((f,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 0', borderBottom:i<c.features.length-1?`0.5px solid ${C.border}`:'none' }}>
                <span style={{ color:c.color, fontWeight:700, fontSize:15, flexShrink:0 }}>✓</span>
                <span style={{ fontSize:13, color:C.dark, lineHeight:1.5 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── About FSU + RECAST ────────────────────────────────────────────
function About() {
  const [ref,v] = useVisible()
  const isMobile = useIsMobile()
  return (
    <section id='about' ref={ref} style={{ padding:'80px 5%', background:C.bg }}>
      <div style={{ maxWidth:1100, margin:'0 auto', display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 32 : 48, alignItems:'center', opacity:v?1:0, transition:'all 0.6s' }}>
        <div>
          <div style={{ color:C.garnet, fontWeight:700, fontSize:11, letterSpacing:2, textTransform:'uppercase', marginBottom:16 }}>About the project</div>
          <h2 style={{ fontSize:'clamp(22px,3vw,34px)', fontWeight:800, color:C.dark, lineHeight:1.2, marginBottom:18 }}>
            Developed at the RECAST Lab,<br />FSU Innovation Hub.
          </h2>
          <p style={{ fontSize:13, color:C.gray, lineHeight:1.8, marginBottom:16 }}>
            CASTmir is a funded research project through the <strong>ReliaQuest Innovation Challenge Fund</strong> at Florida State University — housed in the RECAST Lab at the FSU Innovation Hub, piloting across 17 colleges and 35+ AI platforms.
          </p>
          <p style={{ fontSize:13, color:C.gray, lineHeight:1.8 }}>
            The architecture is designed to generalize to any institution or organization deploying AI tools at scale.
          </p>
        </div>

        {/* Mascot circle — Image 1 */}
        <div style={{ position:'relative', display:'flex', justifyContent:'center' }}>
          <div style={{ position:'relative' }}>
            <img src='/mascot-circle.png' alt='CASTmir mascot seated among live AI performance charts, framed in an FSU garnet and gold circle'
              style={{ width:'min(360px,100%)', objectFit:'contain', borderRadius:20 }} />
            <div style={{ position:'absolute', bottom:16, left:'50%', transform:'translateX(-50%)', background:'rgba(90,31,46,0.93)', backdropFilter:'blur(8px)', borderRadius:12, padding:'10px 22px', whiteSpace:'nowrap', textAlign:'center' }}>
              <div style={{ color:C.gold, fontWeight:700, fontSize:13 }}>RECAST Team · FSU Innovation Hub</div>
              <div style={{ color:'rgba(255,255,255,0.6)', fontSize:11, marginTop:2 }}>recast.team</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── CTA ───────────────────────────────────────────────────────────
function CTA({ onEnter }) {
  const [ref,v] = useVisible()
  return (
    <section ref={ref} style={{ padding:'80px 5%', background:`linear-gradient(135deg,${C.garnetD},${C.garnet})`, textAlign:'center' }}>
      <div style={{ maxWidth:680, margin:'0 auto', opacity:v?1:0, transform:v?'none':'translateY(24px)', transition:'all 0.6s' }}>
        {/* Mascot clean — Image 2 */}
        <img src='/mascot-cta.png' alt='CASTmir mascot, ready to help' style={{ width:110, marginBottom:24, filter:'drop-shadow(0 8px 20px rgba(0,0,0,0.25))' }} />
        <h2 style={{ fontSize:'clamp(26px,4vw,42px)', fontWeight:800, color:'#fff', lineHeight:1.2, marginBottom:18 }}>
          Ready to see what's happening<br /><span style={{ color:C.gold }}>inside your AI tools?</span>
        </h2>
        <p style={{ fontSize:15, color:'rgba(255,255,255,0.7)', marginBottom:36, lineHeight:1.7 }}>
          Start with the LMSYS-Chat-1M pilot dataset. When your institution grants data access, CASTmir connects to your real AI tools without changing a single line of your existing setup.
        </p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <button onClick={onEnter} style={{ background:C.gold, color:C.garnetD, border:'none', borderRadius:10, padding:'14px 36px', fontSize:15, fontWeight:800, cursor:'pointer', boxShadow:'0 8px 24px rgba(206,184,136,0.3)', transition:'all 0.2s' }}
            onMouseOver={e=>e.target.style.transform='translateY(-2px)'}
            onMouseOut={e=>e.target.style.transform=''}>
            Launch CASTmir Dashboard →
          </button>
          <a href='https://recast.team' target='_blank' rel='noopener noreferrer' style={{ background:'rgba(255,255,255,0.1)', color:'#fff', border:'1px solid rgba(255,255,255,0.25)', borderRadius:10, padding:'14px 28px', fontSize:14, fontWeight:500, textDecoration:'none' }}>
            Visit RECAST Lab ↗
          </a>
        </div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────
function Footer() {
  const isMobile = useIsMobile()
  return (
    <footer style={{ background:C.dark, padding:'40px 5% 24px' }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        <div style={{ display:'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent:'space-between', gap:32, marginBottom:32 }}>
          <div>
            <div onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, cursor:'pointer', width:'fit-content' }}>
              <img src='/mascot-head.png' alt='CASTmir' style={{ width:32, objectFit:'contain' }} />
              <div>
                <div style={{ color:'#fff', fontWeight:800, fontSize:16, letterSpacing:3 }}>CASTmir</div>
                <div style={{ color:C.gold, fontSize:8, letterSpacing:1 }}>AI PERFORMANCE INTELLIGENCE</div>
              </div>
            </div>
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.35)', maxWidth:240, lineHeight:1.7 }}>
              Context-Aware AI Performance Intelligence. RECAST Lab, FSU Innovation Hub. ReliaQuest 2026.
            </p>
          </div>
          <div style={{ display:'flex', gap: isMobile ? 28 : 48, flexWrap:'wrap' }}>
            {[
              { h:'Project', links:['Dashboard','Documentation','GitHub'] },
              { h:'Research', links:['RECAST Lab','SDL Framework','Publications'] },
              { h:'FSU', links:['Innovation Hub','Office of Research','ReliaQuest Fund'] },
            ].map(col=>(
              <div key={col.h}>
                <div style={{ fontSize:11, fontWeight:700, color:C.gold, textTransform:'uppercase', letterSpacing:1, marginBottom:12 }}>{col.h}</div>
                {col.links.map(l=>(
                  <div key={l} style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:8, cursor:'pointer', transition:'color 0.15s' }}
                    onMouseOver={e=>e.target.style.color='#fff'} onMouseOut={e=>e.target.style.color='rgba(255,255,255,0.4)'}>{l}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:18, display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.28)' }}>© 2026 CASTmir · RECAST Team · Florida State University</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.28)' }}>Funded by ReliaQuest Innovation Challenge Fund · Powered by AWS Bedrock</div>
        </div>
      </div>
    </footer>
  )
}

// ── Assembly ──────────────────────────────────────────────────────
export default function Landing({ onEnter }) {
  return (
    <div>
      <CastmirBar h={4} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
      <Nav onEnter={onEnter} />
      <Hero onEnter={onEnter} />
      <StatsBar />
      <RecastCallout />
      <Problem />
      <Agents />
      <Research />
      <UseCases />
      <About />
      <CTA onEnter={onEnter} />
      <Footer />
    </div>
  )
}
