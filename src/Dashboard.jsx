/**
 * PRISM — Dashboard
 * All imports are from the same src/ folder.
 * Uses mock data by default. Set VITE_API_URL to connect a real backend.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { C, MODEL_COLORS, MODELS, AGENT_DEFS, FSU_COLLEGES } from './constants.js'
import { getDashboardData, getDeptBreakdown }                  from './mockData.js'
import { rewritePrompt, downloadCSV, downloadJSON }            from './agents.js'
import { buildReport, reportToMarkdown, downloadText, downloadReportPDF } from './report.js'
import { PrismBar, KPI, Card, Pill, ChartTip, AccBar, Table, TR, TD } from './UI.jsx'

const TABS = ['Overview','Models','Agents','Alerts','COACH','Reports']

// ── COACH modal ────────────────────────────────────────────────────
function CoachModal({ college, model, onClose }) {
  const [prompt,  setPrompt]  = useState('')
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState(null)

  const run = async () => {
    if (!prompt.trim()) return
    setLoading(true); setErr(null); setResult(null)
    try   { setResult(await rewritePrompt(prompt, { college, model })) }
    catch (e) { setErr(e.message) }
    finally   { setLoading(false) }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 }}>
      <div style={{ background:C.card, borderRadius:16, padding:28, maxWidth:640, width:'100%', maxHeight:'85vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:C.dark }}>🧠 COACH — Prompt Improvement</div>
            <div style={{ fontSize:11, color:C.gray, marginTop:2 }}>Powered by a large language model</div>
          </div>
          <button onClick={onClose} style={{ border:'none', background:'none', cursor:'pointer', fontSize:22, color:C.gray }}>×</button>
        </div>

        <label style={{ fontSize:11, fontWeight:600, color:C.gray, display:'block', marginBottom:6 }}>YOUR PROMPT</label>
        <textarea value={prompt} onChange={e=>setPrompt(e.target.value)}
          placeholder='Paste the prompt you want COACH to improve...'
          style={{ width:'100%', padding:'10px 12px', border:`1px solid ${C.border}`, borderRadius:8, fontSize:13, minHeight:100, resize:'vertical', fontFamily:'inherit', color:C.dark, outline:'none' }} />

        <div style={{ display:'flex', gap:8, margin:'10px 0 16px', flexWrap:'wrap', fontSize:11, color:C.gray }}>
          {college && <span>College: <strong style={{color:C.dark}}>{college}</strong></span>}
          {model   && <span>Model: <strong style={{color:C.dark}}>{model}</strong></span>}
        </div>

        <button onClick={run} disabled={loading || !prompt.trim()} style={{ background:loading?C.muted:C.garnet, color:'#fff', border:'none', borderRadius:8, padding:'10px 24px', fontSize:13, fontWeight:700, cursor:loading?'not-allowed':'pointer', marginBottom:20 }}>
          {loading ? '⟳ COACH is thinking...' : 'Rewrite with COACH →'}
        </button>

        {err && (
          <div style={{ background:C.redL, border:`1px solid ${C.red}30`, borderRadius:8, padding:'12px 14px', color:C.red, fontSize:12, marginBottom:16 }}>
            <strong>Error:</strong> {err}
            {err.includes('API key') && (
              <div style={{ marginTop:8 }}>
                Add <code style={{ background:'rgba(0,0,0,0.07)', padding:'1px 5px', borderRadius:3 }}>ANTHROPIC_API_KEY=sk-ant-...</code> to your <code>.env</code> file and restart Vite.
              </div>
            )}
          </div>
        )}

        {result && !err && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:C.green, marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 }}>✓ Improved prompt</div>
            <div style={{ background:C.greenL, border:`1px solid ${C.green}20`, padding:'12px 14px', borderRadius:8, fontSize:13, lineHeight:1.65, marginBottom:14, color:C.dark }}>
              {result.rewritten_prompt}
            </div>
            <div style={{ fontSize:12, color:C.gray, lineHeight:1.7, marginBottom:12 }}>{result.explanation}</div>
            {result.key_improvements?.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.gray, marginBottom:6 }}>KEY IMPROVEMENTS</div>
                {result.key_improvements.map((imp,i)=>(
                  <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:5 }}>
                    <span style={{ color:C.amber, fontWeight:700, flexShrink:0 }}>→</span>
                    <span style={{ fontSize:12, color:C.dark }}>{imp}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:'flex', gap:16, fontSize:12, background:C.bg, borderRadius:8, padding:'10px 14px' }}>
              <span>PMI: <strong style={{color:C.navy}}>{result.pmi_before}/5</strong> → <strong style={{color:C.green}}>{result.pmi_after}/5</strong></span>
              {result.estimated_quality_gain && <span>Est. gain: <strong style={{color:C.green}}>{result.estimated_quality_gain}</strong></span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────
export default function Dashboard({ onBack }) {
  const [tab,       setTab]     = useState('Overview')
  const [college,   setCollege] = useState('all')
  const [dept,      setDept]    = useState('all')
  const [days,      setDays]    = useState(30)
  const [data,      setData]    = useState(null)
  const [loading,   setLoading] = useState(true)
  const [depts,     setDepts]   = useState([])
  const [coach,     setCoach]   = useState(false)
  const [tick,      setTick]    = useState(0)
  const [reportMode,setReportMode] = useState('executive')

  // Live ticker
  useEffect(() => {
    const t = setInterval(() => setTick(n => n+1), 4000)
    return () => clearInterval(t)
  }, [])

  // Load data — real backend if VITE_API_URL set, else mock
  const load = useCallback(() => {
    setLoading(true)
    const apiUrl = import.meta.env.VITE_API_URL
    if (apiUrl) {
      const p  = new URLSearchParams({ days })
      if (college !== 'all') p.set('college', college)
      const eps = ['summary','accuracy/trends','sessions/volume','accuracy/by-college',
                   'models/comparison','drift/distribution','drift/events','alerts','pmi/distribution']
      Promise.all(eps.map(e => fetch(`${apiUrl}/api/${e}?${p}`).then(r => r.json())))
        .then(([kpis,trends,volume,colleges,models,driftDist,driftEvents,alerts,pmiDist]) =>
          setData({ kpis, trends, volume, colleges, models, driftDist, driftEvents, alerts, pmiDist })
        )
        .catch(() => setData(getDashboardData({ days, college: college !== 'all' ? college : null })))
        .finally(() => setLoading(false))
    } else {
      setTimeout(() => {
        setData(getDashboardData({ days, college: college !== 'all' ? college : null }))
        setLoading(false)
      }, 160)
    }
  }, [days, college])

  useEffect(() => { load() }, [load])

  // Dept dropdown
  useEffect(() => {
    if (college !== 'all') { setDepts(FSU_COLLEGES[college]?.depts || []); setDept('all') }
    else setDepts([])
  }, [college])

  const liveAcc  = data ? +(data.kpis.overall_accuracy + Math.sin(tick*0.5)*0.5).toFixed(1) : null
  const liveSess = data ? (data.kpis.total_sessions + tick*4).toLocaleString() : null
  const modelNames = data?.trends?.length ? Object.keys(data.trends[0]).filter(k=>k!=='date') : []

  const report = useMemo(() => {
    if (!data) return null
    return buildReport(data, { mode: reportMode, days, college: college !== 'all' ? college : null })
  }, [data, reportMode, days, college])

  return (
    <div style={{ fontFamily:'system-ui,-apple-system,sans-serif', background:C.bg, minHeight:'100vh' }}>
      <PrismBar h={4} onClick={onBack} />

      {/* Nav */}
      <div style={{ background:C.garnet, padding:'0 20px', display:'flex', alignItems:'center', justifyContent:'space-between', height:56, gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {onBack && (
            <button onClick={onBack} style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:6, padding:'4px 10px', color:'rgba(255,255,255,0.75)', fontSize:12, cursor:'pointer' }}>
              ← Home
            </button>
          )}
          <div onClick={onBack} style={{ display:'flex', alignItems:'center', gap:10, cursor: onBack ? 'pointer' : 'default' }}>
            <img src='/mascot-head.png' alt='PRISM' style={{ width:32, height:32, objectFit:'contain' }} />
            <div>
              <div style={{ color:'#fff', fontWeight:700, fontSize:17, letterSpacing:3 }}>PRISM</div>
              <div style={{ color:C.gold, fontSize:8, letterSpacing:1, marginTop:-2 }}>AI PERFORMANCE INTELLIGENCE</div>
            </div>
          </div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.55)', paddingLeft:12, borderLeft:'1px solid rgba(255,255,255,0.2)' }}>
            RECAST Team · FSU Innovation Hub
          </div>
        </div>
        <div style={{ display:'flex', gap:2 }}>
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{ padding:'5px 12px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, background:tab===t?'rgba(255,255,255,0.16)':'transparent', color:tab===t?'#fff':'rgba(255,255,255,0.62)', fontWeight:tab===t?600:400 }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ background:C.card, borderBottom:`0.5px solid ${C.border}`, padding:'8px 20px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <span style={{ fontSize:10, color:C.gray, fontWeight:600, letterSpacing:0.5 }}>FILTERS</span>

        <select value={college} onChange={e=>setCollege(e.target.value)}
          style={{ fontSize:12, padding:'4px 8px', border:`0.5px solid ${C.border}`, borderRadius:6, background:C.bg, color:C.dark, maxWidth:240 }}>
          <option value='all'>All Colleges</option>
          {Object.keys(FSU_COLLEGES).map(c=>(
            <option key={c} value={c}>
              {FSU_COLLEGES[c].abbr} — {c.replace('College of ','').replace('Herbert Wertheim ','').replace('Anne Spencer Daves ','').substring(0,36)}
            </option>
          ))}
        </select>

        {depts.length > 0 && (
          <select value={dept} onChange={e=>setDept(e.target.value)}
            style={{ fontSize:12, padding:'4px 8px', border:`0.5px solid ${C.border}`, borderRadius:6, background:C.bg, color:C.dark, maxWidth:230 }}>
            <option value='all'>All Departments</option>
            {depts.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
        )}

        <span style={{ fontSize:11, color:C.gray }}>Time range:</span>
        <div style={{ display:'flex', gap:3 }} role='group' aria-label='Time range'>
          {[7,30,90].map(d=>(
            <button key={d} onClick={()=>setDays(d)} title={`Show data from the last ${d} days`}
              style={{ padding:'3px 9px', borderRadius:5, fontSize:11, cursor:'pointer', border:`0.5px solid ${days===d?C.garnet:C.border}`, background:days===d?C.garnet:C.bg, color:days===d?'#fff':C.gray, fontWeight:days===d?600:400 }}>
              {d} days
            </button>
          ))}
        </div>

        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:C.green, display:'inline-block', animation:'pulse 2s infinite' }} />
          <span style={{ fontSize:10, color:C.green, fontWeight:600 }}>LIVE</span>
          <span style={{ fontSize:10, color:C.muted }}>
            {import.meta.env.VITE_API_URL ? '· Real backend' : '· LMSYS-Chat-1M pilot data'}
          </span>
          <button onClick={load} style={{ marginLeft:6, fontSize:10, padding:'3px 8px', border:`0.5px solid ${C.border}`, borderRadius:5, cursor:'pointer', background:C.bg, color:C.gray }}>Refresh</button>
        </div>
      </div>

      {college !== 'all' && (
        <div style={{ background:C.goldL, borderBottom:`0.5px solid ${C.gold}60`, padding:'6px 20px', fontSize:11, color:C.garnetD }}>
          Viewing: <strong>{college}</strong>{dept!=='all'&&<> → <strong>{dept}</strong></>}
          <button onClick={()=>{setCollege('all');setDept('all')}} style={{ marginLeft:12, fontSize:10, color:C.garnet, background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>Clear filter</button>
        </div>
      )}

      {/* Content */}
      <div style={{ padding:'18px 20px', maxWidth:1400, margin:'0 auto' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:'80px 0', color:C.muted }}>
            <div style={{ width:32, height:32, border:`3px solid ${C.border}`, borderTopColor:C.garnet, borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }} />
            Loading PRISM data...
          </div>
        ) : data && <>

          {/* ═══ OVERVIEW ═══ */}
          {tab==='Overview' && (
            <div>
              <div style={{ display:'flex', gap:10, marginBottom:16 }}>
                <KPI label='Overall accuracy'   value={liveAcc?`${liveAcc}%`:'—'} sub='vs last period' trend={data.kpis.accuracy_change} color={C.garnet} />
                <KPI label='Sessions monitored' value={liveSess} sub={`last ${days} days`} trend={data.kpis.sessions_change} color='#0D7377' />
                <KPI label='Active alerts'       value={data.alerts?.length??0} sub='from Agent 2' color={C.amber} />
                <KPI label='Interventions'       value={data.kpis.interventions} sub='from COACH' color={C.purple} />
                <KPI label='Models tracked'      value={data.kpis.models_tracked} sub={`across ${data.kpis.colleges_covered} colleges`} color={C.navy} />
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1.8fr 1fr', gap:12, marginBottom:12 }}>
                <Card title='Model accuracy trends' sub='Output quality score over time across all models'>
                  <ResponsiveContainer width='100%' height={220}>
                    <LineChart data={data.trends} margin={{top:4,right:4,left:-22,bottom:0}}>
                      <CartesianGrid strokeDasharray='3 3' stroke={C.border} />
                      <XAxis dataKey='date' tick={{fontSize:10,fill:C.gray}} tickLine={false} axisLine={false} />
                      <YAxis domain={[65,100]} tick={{fontSize:10,fill:C.gray}} tickLine={false} axisLine={false} tickFormatter={v=>`${v}%`} />
                      <Tooltip content={<ChartTip/>} />
                      <Legend iconType='circle' iconSize={7} wrapperStyle={{fontSize:11}} />
                      {modelNames.slice(0,8).map((m,i)=>(
                        <Line key={m} type='monotone' dataKey={m} stroke={MODEL_COLORS[i%MODEL_COLORS.length]} strokeWidth={2} dot={false} activeDot={{r:4}} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                <Card title='Drift type distribution' sub='Root cause classification breakdown'>
                  <ResponsiveContainer width='100%' height={150}>
                    <PieChart>
                      <Pie data={data.driftDist} cx='50%' cy='50%' innerRadius={44} outerRadius={68} paddingAngle={3} dataKey='count'>
                        {data.driftDist.map((_,i)=><Cell key={i} fill={[C.navy,C.amber,C.purple][i%3]} />)}
                      </Pie>
                      <Tooltip formatter={(v,n)=>[`${v}`,n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display:'flex', flexDirection:'column', gap:7, marginTop:10 }}>
                    {data.driftDist.map((d,i)=>(
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:11 }}>
                        <span><span style={{ display:'inline-block', width:9, height:9, borderRadius:2, background:[C.navy,C.amber,C.purple][i%3], marginRight:7 }} />{d.drift_type}</span>
                        <strong style={{ color:[C.navy,C.amber,C.purple][i%3] }}>{d.percentage??d.count}%</strong>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              <Card title='Session volume and quality' sub='Daily sessions alongside average quality score' style={{marginBottom:14}}>
                <ResponsiveContainer width='100%' height={180}>
                  <AreaChart data={data.volume} margin={{top:4,right:4,left:-22,bottom:0}}>
                    <defs>
                      <linearGradient id='gS' x1='0' y1='0' x2='0' y2='1'><stop offset='5%' stopColor='#0D7377' stopOpacity={0.2}/><stop offset='95%' stopColor='#0D7377' stopOpacity={0}/></linearGradient>
                      <linearGradient id='gQ' x1='0' y1='0' x2='0' y2='1'><stop offset='5%' stopColor={C.garnet} stopOpacity={0.2}/><stop offset='95%' stopColor={C.garnet} stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray='3 3' stroke={C.border} />
                    <XAxis dataKey='date' tick={{fontSize:10,fill:C.gray}} tickLine={false} axisLine={false} />
                    <YAxis yAxisId='l' tick={{fontSize:10,fill:C.gray}} tickLine={false} axisLine={false} />
                    <YAxis yAxisId='r' orientation='right' domain={[70,100]} tick={{fontSize:10,fill:C.gray}} tickLine={false} axisLine={false} tickFormatter={v=>`${v}%`} />
                    <Tooltip content={<ChartTip/>} />
                    <Legend iconType='circle' iconSize={7} wrapperStyle={{fontSize:11}} />
                    <Area yAxisId='l' type='monotone' dataKey='sessions' stroke='#0D7377' fill='url(#gS)' strokeWidth={2} name='Sessions' />
                    <Area yAxisId='r' type='monotone' dataKey='quality'  stroke={C.garnet} fill='url(#gQ)' strokeWidth={2} name='Quality %' />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>

              <div style={{ background:C.card, border:`0.5px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:`0.5px solid ${C.border}` }}>
                  <div style={{ fontWeight:700, fontSize:13, color:C.dark }}>College performance breakdown</div>
                  <div style={{ fontSize:10, color:C.gray, marginTop:2 }}>Click any row to drill into departments</div>
                </div>
                <Table headers={['College','Avg. accuracy','Sessions','Alerts','Trend']} maxH='340px'>
                  {data.colleges.map((c,i)=>{
                    const acc = +(c.accuracy||c.avg_accuracy||0)
                    return (
                      <TR key={i} onClick={()=>setCollege(c.college)}>
                        <TD><strong>{c.college}</strong> <span style={{fontSize:10,color:C.muted}}>({c.abbr})</span></TD>
                        <TD><AccBar value={acc} /></TD>
                        <TD style={{color:C.gray}}>{(c.sessions||c.session_count||0).toLocaleString()}</TD>
                        <TD>{(c.active_alerts||0)>0?<Pill label={`${c.active_alerts} alert${c.active_alerts>1?'s':''}`} color={C.red} bg={C.redL}/>:<Pill label='None' color={C.green} bg={C.greenL}/>}</TD>
                        <TD>{c.trend==='up'?'📈':c.trend==='down'?'📉':'➡️'}</TD>
                      </TR>
                    )
                  })}
                </Table>
              </div>
            </div>
          )}

          {/* ═══ MODELS ═══ */}
          {tab==='Models' && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                <Card title='Model accuracy comparison' sub='Average output quality score'>
                  <ResponsiveContainer width='100%' height={240}>
                    <BarChart data={data.models} margin={{top:4,right:4,left:-22,bottom:0}}>
                      <CartesianGrid strokeDasharray='3 3' stroke={C.border} vertical={false} />
                      <XAxis dataKey='model' tick={{fontSize:10,fill:C.gray}} tickLine={false} axisLine={false} />
                      <YAxis domain={[65,100]} tick={{fontSize:10,fill:C.gray}} tickLine={false} axisLine={false} tickFormatter={v=>`${v}%`} />
                      <Tooltip content={<ChartTip/>} />
                      <Bar dataKey='accuracy' name='Accuracy' radius={[5,5,0,0]}>
                        {data.models.map((_,i)=><Cell key={i} fill={MODEL_COLORS[i%MODEL_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
                <Card title='Session volume by model' sub='Total sessions in selected period'>
                  <ResponsiveContainer width='100%' height={240}>
                    <BarChart data={data.models} layout='vertical' margin={{top:4,right:10,left:10,bottom:0}}>
                      <CartesianGrid strokeDasharray='3 3' stroke={C.border} horizontal={false} />
                      <XAxis type='number' tick={{fontSize:10,fill:C.gray}} tickLine={false} axisLine={false} />
                      <YAxis dataKey='model' type='category' tick={{fontSize:10,fill:C.gray}} tickLine={false} axisLine={false} width={88} />
                      <Tooltip content={<ChartTip/>} />
                      <Bar dataKey='sessions' name='Sessions' radius={[0,5,5,0]}>
                        {data.models.map((_,i)=><Cell key={i} fill={MODEL_COLORS[i%MODEL_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
              <div style={{ background:C.card, border:`0.5px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:`0.5px solid ${C.border}` }}><div style={{ fontWeight:700, fontSize:13, color:C.dark }}>Model performance summary</div></div>
                <Table headers={['Model','Accuracy','Sessions','Avg PMI','Avg tokens','Latency','Status']}>
                  {data.models.map((m,i)=>{
                    const acc=+(m.accuracy||m.avg_accuracy||0)
                    const col=acc>=90?C.green:acc>=82?C.amber:C.red
                    return (
                      <TR key={i}>
                        <TD><div style={{display:'flex',alignItems:'center',gap:7}}><span style={{width:9,height:9,borderRadius:'50%',background:MODEL_COLORS[i%MODEL_COLORS.length],display:'inline-block'}}/><strong>{m.model}</strong></div></TD>
                        <TD><strong style={{color:col}}>{acc}%</strong></TD>
                        <TD style={{color:C.gray}}>{(m.sessions||0).toLocaleString()}</TD>
                        <TD style={{color:C.gray}}>{m.avg_pmi?.toFixed(2)??'—'}</TD>
                        <TD style={{color:C.gray}}>{m.avg_tokens?Math.round(m.avg_tokens).toLocaleString():'—'}</TD>
                        <TD style={{color:C.gray}}>{m.avg_latency?`${m.avg_latency}s`:'—'}</TD>
                        <TD><Pill label='● Active' color={C.green} bg={C.greenL}/></TD>
                      </TR>
                    )
                  })}
                </Table>
              </div>
            </div>
          )}

          {/* ═══ AGENTS ═══ */}
          {tab==='Agents' && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:14 }}>
                {AGENT_DEFS.map((a,i)=>(
                  <div key={i} style={{ background:C.card, border:`0.5px solid ${C.border}`, borderLeft:`4px solid ${a.color}`, borderRadius:12, padding:16 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                      <div>
                        <div style={{ fontWeight:700, fontSize:12, color:C.dark }}>{a.name}</div>
                        <div style={{ fontSize:10, color:C.gray }}>{a.role}</div>
                      </div>
                      <Pill label={i===2?'⟳ Running':'● Active'} color={i===2?C.amber:C.green} bg={i===2?C.amberL:C.greenL} />
                    </div>
                    <div style={{ fontSize:10, color:C.gray, lineHeight:1.55, marginBottom:10 }}>{a.desc}</div>
                    <div style={{ fontSize:21, fontWeight:700, color:a.color }}>
                      {i===0?(data.kpis.total_sessions+tick*4).toLocaleString():i===1?data.driftEvents?.length??0:i===2?data.kpis.interventions:'138'}
                    </div>
                    <div style={{ fontSize:10, color:C.gray }}>{['sessions captured','drift events','interventions','reports generated'][i]}</div>
                  </div>
                ))}
              </div>
              <Card title='Pipeline health' sub='Daily events processed through each agent stage'>
                <ResponsiveContainer width='100%' height={200}>
                  <AreaChart data={data.volume} margin={{top:4,right:4,left:-22,bottom:0}}>
                    <CartesianGrid strokeDasharray='3 3' stroke={C.border} />
                    <XAxis dataKey='date' tick={{fontSize:10,fill:C.gray}} tickLine={false} axisLine={false} />
                    <YAxis tick={{fontSize:10,fill:C.gray}} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTip/>} />
                    <Legend iconType='circle' iconSize={7} wrapperStyle={{fontSize:11}} />
                    <Area type='monotone' dataKey='sessions' stroke='#0D7377' fill='#0D737718' strokeWidth={2} name='Sessions monitored' />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )}

          {/* ═══ ALERTS ═══ */}
          {tab==='Alerts' && (
            <div>
              <div style={{ display:'flex', gap:10, marginBottom:16 }}>
                {[
                  {label:'High severity',  value:data.driftEvents?.filter(e=>e.severity==='high').length??0,   color:C.red   },
                  {label:'Medium severity',value:data.driftEvents?.filter(e=>e.severity==='medium').length??0, color:C.amber },
                  {label:'Low severity',   value:data.driftEvents?.filter(e=>e.severity==='low').length??0,    color:'#0D7377'},
                  {label:'Total events',   value:data.driftEvents?.length??0,                                  color:C.navy  },
                ].map((k,i)=><KPI key={i} label={k.label} value={k.value} color={k.color} />)}
              </div>
              <div style={{ background:C.card, border:`0.5px solid ${C.border}`, borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:`0.5px solid ${C.border}` }}>
                  <div style={{ fontWeight:700, fontSize:13, color:C.dark }}>All drift events</div>
                  <div style={{ fontSize:10, color:C.gray, marginTop:2 }}>Detected by Agent 2 — Degradation Diagnostician</div>
                </div>
                <Table headers={['Severity','Drift type','Model','College','Score drop','Detected','Status']}>
                  {(data.driftEvents||[]).slice(0,25).map((e,i)=>{
                    const sc=e.severity==='high'?C.red:e.severity==='medium'?C.amber:'#0D7377'
                    const sb=e.severity==='high'?C.redL:e.severity==='medium'?C.amberL:'#E6F4F4'
                    return (
                      <TR key={i}>
                        <TD><Pill label={e.severity?.toUpperCase()} color={sc} bg={sb}/></TD>
                        <TD style={{fontWeight:500}}>{e.drift_type}</TD>
                        <TD>{e.model}</TD>
                        <TD style={{color:C.gray,maxWidth:180}}>{e.college?.replace('College of ','').replace('Anne Spencer Daves ','').substring(0,30)}</TD>
                        <TD><span style={{color:C.red,fontWeight:600}}>{e.score_delta?`${e.score_delta.toFixed(1)}%`:'—'}</span></TD>
                        <TD style={{color:C.muted}}>{e.detected_at?new Date(e.detected_at).toLocaleDateString():'—'}</TD>
                        <TD><Pill label={e.status==='active'?'Active':'Resolved'} color={e.status==='active'?C.red:C.green} bg={e.status==='active'?C.redL:C.greenL}/></TD>
                      </TR>
                    )
                  })}
                </Table>
              </div>
            </div>
          )}

          {/* ═══ COACH ═══ */}
          {tab==='COACH' && (
            <Card title='🧠 COACH — Recommendation Engine (Agent 3)' sub='Powered by a large language model (local) or AWS Bedrock (production)'>
              <div style={{ background:C.amberL, border:`1px solid ${C.gold}50`, borderRadius:8, padding:'12px 16px', fontSize:12, color:C.amber, marginBottom:20 }}>
                <strong>Setup:</strong> Add <code style={{background:'rgba(0,0,0,0.08)',padding:'1px 5px',borderRadius:4}}>ANTHROPIC_API_KEY=sk-ant-...</code> to your <code>.env</code> file. The key stays server-side and never reaches the browser.
              </div>
              <button onClick={()=>setCoach(true)} style={{ background:C.garnet, color:'#fff', border:'none', borderRadius:9, padding:'11px 26px', fontSize:14, fontWeight:700, cursor:'pointer', marginBottom:28 }}>
                Open Prompt Rewriter →
              </button>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                {[
                  {level:'User level',        icon:'👤', color:'#0D7377', desc:'In-context prompt rewrite sent directly to the individual. Explains changes so users learn over time.'},
                  {level:'Institution level',  icon:'🏛️', color:C.navy,   desc:'Model routing recommendation to administrators when a degrading tool has a better-performing alternative.'},
                  {level:'System level',       icon:'⚙️', color:C.purple, desc:'Prompt template updates validated by A/B test before deployment. Requires human approval.'},
                ].map((c,i)=>(
                  <div key={i} style={{ background:C.bg, border:`0.5px solid ${C.border}`, borderTop:`3px solid ${c.color}`, borderRadius:10, padding:'16px 14px' }}>
                    <div style={{ fontSize:20, marginBottom:8 }}>{c.icon}</div>
                    <div style={{ fontWeight:700, fontSize:13, color:c.color, marginBottom:6 }}>{c.level}</div>
                    <div style={{ fontSize:12, color:C.gray, lineHeight:1.6 }}>{c.desc}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ═══ REPORTS ═══ */}
          {tab==='Reports' && (
            <div>
              <Card title='📄 Performance Report' sub="Plain-English summary of what's happening — no charts to interpret, just what it means" style={{marginBottom:14}}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap' }}>
                  <div style={{ display:'flex', gap:3 }} role='group' aria-label='Report detail level'>
                    {[['executive','Executive Summary'],['detailed','Detailed Report']].map(([m,label])=>(
                      <button key={m} onClick={()=>setReportMode(m)}
                        style={{ padding:'6px 14px', borderRadius:6, fontSize:12, cursor:'pointer', border:`0.5px solid ${reportMode===m?C.garnet:C.border}`, background:reportMode===m?C.garnet:C.bg, color:reportMode===m?'#fff':C.gray, fontWeight:reportMode===m?600:400 }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
                    <button onClick={()=>downloadReportPDF(report, `prism-${reportMode}-report.pdf`)}
                      style={{ background:C.garnet, color:'#fff', border:'none', borderRadius:7, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                      ↓ Download PDF
                    </button>
                    <button onClick={()=>downloadText(reportToMarkdown(report), `prism-${reportMode}-report.md`, 'text/markdown;charset=utf-8;')}
                      style={{ background:C.bg, color:C.dark, border:`0.5px solid ${C.border}`, borderRadius:7, padding:'8px 16px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                      ↓ Download Text
                    </button>
                  </div>
                </div>

                {report && (
                  <div style={{ background:C.bg, border:`0.5px solid ${C.border}`, borderRadius:10, padding:'20px 22px', maxHeight:460, overflowY:'auto' }}>
                    <div style={{ fontWeight:800, fontSize:16, color:C.garnet, marginBottom:2 }}>{report.title}</div>
                    <div style={{ fontSize:11, color:C.muted, marginBottom:18 }}>{report.subtitle}</div>
                    {report.sections.map((sec,i)=>(
                      <div key={i} style={{ marginBottom:18 }}>
                        <div style={{ fontWeight:700, fontSize:13, color:C.dark, marginBottom:7 }}>{sec.heading}</div>
                        {(sec.paragraphs||[]).map((p,j)=>(
                          <p key={j} style={{ fontSize:12.5, color:C.gray, lineHeight:1.75, marginBottom:8 }}>{p}</p>
                        ))}
                        {(sec.bullets||[]).length > 0 && (
                          <ul style={{ margin:0, paddingLeft:18 }}>
                            {sec.bullets.map((b,j)=>(
                              <li key={j} style={{ fontSize:12.5, color:C.gray, lineHeight:1.75, marginBottom:5 }}>{b}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title='Prompt Maturity Index (PMI) distribution' sub='SDL growth signal — prompt sophistication over time' style={{marginBottom:14}}>
                <ResponsiveContainer width='100%' height={200}>
                  <BarChart data={data.pmiDist} margin={{top:4,right:4,left:-10,bottom:0}}>
                    <CartesianGrid strokeDasharray='3 3' stroke={C.border} vertical={false} />
                    <XAxis dataKey='pmi_score' tick={{fontSize:11,fill:C.gray}} tickLine={false} axisLine={false} tickFormatter={v=>`PMI ${v}`} />
                    <YAxis tick={{fontSize:10,fill:C.gray}} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTip/>} />
                    <Bar dataKey='count' name='Sessions' radius={[5,5,0,0]} fill={C.garnet} />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, marginTop:14 }}>
                  {data.pmiDist.map((p,i)=>(
                    <div key={i} style={{ background:C.bg, borderRadius:8, padding:'10px', textAlign:'center', border:`0.5px solid ${C.border}` }}>
                      <div style={{ fontSize:15, fontWeight:800, color:C.garnet }}>PMI {p.pmi_score}</div>
                      <div style={{ fontSize:11, color:C.green, fontWeight:600, margin:'3px 0' }}>{p.avg_quality}%</div>
                      <div style={{ fontSize:10, color:C.muted, lineHeight:1.4 }}>{p.label?.split('—')[0]?.trim()}</div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title='Export research data' sub='FERPA-compliant anonymized exports — aggregated at department level'>
                <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                  {[
                    {label:'Session performance report (college level)', fmt:'CSV',  fn:()=>downloadCSV(data.colleges.map(c=>({college:c.college,accuracy:c.accuracy,sessions:c.sessions,alerts:c.active_alerts})),'prism-college-report.csv')},
                    {label:'Model comparison summary',                    fmt:'CSV',  fn:()=>downloadCSV(data.models,'prism-model-comparison.csv')},
                    {label:'Drift events log',                            fmt:'JSON', fn:()=>downloadJSON(data.driftEvents,'prism-drift-events.json')},
                  ].map((e,i)=>(
                    <div key={i} onClick={e.fn} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 14px', borderRadius:9, border:`0.5px solid ${C.border}`, cursor:'pointer', background:C.bg, transition:'background 0.15s' }}
                      onMouseOver={ev=>ev.currentTarget.style.background=C.light}
                      onMouseOut={ev=>ev.currentTarget.style.background=C.bg}>
                      <span style={{ fontSize:13, color:C.dark }}>↓ {e.label}</span>
                      <Pill label={e.fmt} color={C.gray} bg={C.light} />
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

        </>}
      </div>

      {/* Footer */}
      <div style={{ background:C.card, borderTop:`0.5px solid ${C.border}`, padding:'10px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:6, marginTop:24 }}>
        <div onClick={onBack} style={{ display:'flex', alignItems:'center', gap:8, cursor: onBack ? 'pointer' : 'default' }}>
          <img src='/mascot-head.png' alt='PRISM' style={{ width:22, objectFit:'contain' }} />
          <span style={{ fontSize:12, fontWeight:700, color:C.garnet, letterSpacing:2 }}>PRISM</span>
        </div>
        <span style={{ fontSize:10, color:C.muted }}>AI Performance Intelligence · RECAST Team · FSU Innovation Hub · ReliaQuest 2026</span>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:C.green, display:'inline-block' }} />
          <span style={{ fontSize:10, color:C.green, fontWeight:600 }}>All systems operational</span>
        </div>
      </div>
      <PrismBar h={4} onClick={onBack} />

      {coach && <CoachModal college={college!=='all'?college:null} model={data?.models?.[0]?.model} onClose={()=>setCoach(false)} />}
    </div>
  )
}
