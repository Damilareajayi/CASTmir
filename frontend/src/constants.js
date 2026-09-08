// ── Brand colors — same system as the original CASTmir app ─────────
export const C = {
  garnet:'#782F40', garnetD:'#5A1F2E', garnetL:'#A04060',
  gold:'#CEB888',   goldD:'#A89060',   goldL:'#F5EED9',
  dark:'#1C1C1C',   gray:'#555555',    muted:'#888888',
  light:'#F0EDE8',  bg:'#F8F7F5',      card:'#FFFFFF',
  border:'rgba(0,0,0,0.08)',
  teal:'#0D7377',   tealL:'#E6F4F4',
  navy:'#1A3E6B',   navyL:'#E8EFF8',
  amber:'#C47B2B',  amberL:'#FBF2E3',
  purple:'#6B2D8E', purpleL:'#F2EAF8',
  green:'#1E6B3C',  greenL:'#E8F4EE',
  red:'#C0392B',    redL:'#FAEAEA',
}

export const MODEL_COLORS = [
  '#782F40','#0D7377','#1A3E6B','#C47B2B',
  '#6B2D8E','#1E6B3C','#E07B39','#607D8B',
]

export const SEVERITY_COLOR = { low: C.teal, medium: C.amber, high: C.red, critical: C.purple }

// ── Supported AI tools — matches extension/background.js SUPPORTED_SITES ──
export const TOOLS = ['ChatGPT', 'Claude', 'Gemini', 'Copilot', 'Perplexity']

// ── Four agents — updated for the browser-extension architecture ──────
export const AGENT_DEFS = [
  {
    num: '01', name: 'Performance Monitor', role: 'Agent 1',
    color: '#0D7377', colorL: '#E6F4F4', icon: '📡',
    tagline: 'Scores every AI turn from metadata alone',
    desc: 'Runs inside the browser extension. Derives prompt structure signals (role framing, format instructions, constraints) locally from the page — only the derived booleans and counts ever leave the browser. Prompt and response text are never captured.',
    tech: 'Chrome Manifest V3 · Content script · FastAPI',
    signals: ['Quality score (0–100)', 'Prompt Maturity Index (PMI 1–5)', 'Response latency', 'Turn depth'],
  },
  {
    num: '02', name: 'Degradation + Security Diagnostician', role: 'Agent 2',
    color: '#1A3E6B', colorL: '#E8EFF8', icon: '🔬',
    tagline: 'Two tracks, run on every turn',
    desc: 'Track 1 runs CUSUM statistical process control to classify performance drift. Track 2 runs a RandomForest classifier over behavioral features to flag security threats — prompt injection, MCP manipulation, RAG poisoning, data exfiltration.',
    tech: 'CUSUM (Page’s algorithm) · scikit-learn RandomForest · OCSF v1.5.0',
    signals: ['Model / Prompt / Context drift', 'Threat score (0–1)', 'OCSF-formatted findings', 'Severity classification'],
  },
  {
    num: '03', name: 'Recommendation Engine (COACH)', role: 'Agent 3',
    color: '#C47B2B', colorL: '#FBF2E3', icon: '🧠',
    tagline: 'Performance mode and security mode',
    desc: 'Performance mode calls AWS Bedrock to rewrite weak prompts, server-side only. Security mode never calls an external API — a flagged session gets an immediate template-based warning for speed, then logs the OCSF event.',
    tech: 'AWS Bedrock (Converse API) · Template-based security alerts',
    signals: ['In-context prompt rewrites', 'Immediate security warnings', 'PMI before/after'],
  },
  {
    num: '04', name: 'Reporting Engine', role: 'Agent 4',
    color: '#6B2D8E', colorL: '#F2EAF8', icon: '📊',
    tagline: 'Two dashboards, two privacy scopes',
    desc: 'The private user dashboard is scoped to one user_hash — no query can leak across users. The admin research dashboard is aggregate-only, keyed to no individual user, built for cohort-wide trends and the OCSF security feed.',
    tech: 'FastAPI · DuckDB · React · Recharts',
    signals: ['Personal quality/PMI trend', 'Cohort accuracy trend', 'OCSF security feed', 'Intervention outcomes'],
  },
]
