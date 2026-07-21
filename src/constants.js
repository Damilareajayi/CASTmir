// ── Brand colors ──────────────────────────────────────────────────
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

// ── Color arrays ──────────────────────────────────────────────────
export const MODEL_COLORS = [
  '#782F40','#0D7377','#1A3E6B','#C47B2B',
  '#6B2D8E','#1E6B3C','#E07B39','#607D8B',
]
export const AGENT_COLORS = ['#0D7377','#1A3E6B','#C47B2B','#6B2D8E']

// ── AI models ─────────────────────────────────────────────────────
export const MODELS = [
  { id:'gpt-4',          name:'GPT-4',        baseline:88.4 },
  { id:'gpt-3.5-turbo',  name:'GPT-3.5',      baseline:79.1 },
  { id:'claude-3.5',     name:'Claude 3.5',   baseline:91.2 },
  { id:'gemini-pro',     name:'Gemini Pro',   baseline:83.7 },
  { id:'copilot',        name:'Copilot',      baseline:81.3 },
  { id:'llama-2-70b',    name:'Llama 2 70B',  baseline:78.0 },
  { id:'mistral-7b',     name:'Mistral 7B',   baseline:75.4 },
  { id:'palm-2',         name:'PaLM 2',       baseline:82.1 },
]

// ── All 17 FSU colleges with departments ──────────────────────────
export const FSU_COLLEGES = {
  'College of Arts and Sciences': {
    abbr:'CAS',
    depts:['Anthropology','Biological Science','Chemistry & Biochemistry','Classics',
      'Computer Science','Earth, Ocean & Atmospheric Science','English','History',
      'Mathematics','Modern Languages & Linguistics','Philosophy','Physics',
      'Psychology','Religion','Scientific Computing','Statistics'],
  },
  'Herbert Wertheim College of Business': {
    abbr:'COB',
    depts:['Accounting','Finance','Management','Management Information Systems',
      'Marketing','Risk Management & Insurance'],
  },
  'College of Communication and Information': {
    abbr:'CCI',
    depts:['Communication','Information','Library & Information Studies'],
  },
  'College of Criminology and Criminal Justice': {
    abbr:'CCCJ',
    depts:['Criminology & Criminal Justice'],
  },
  'Anne Spencer Daves College of Education, Health, and Human Sciences': {
    abbr:'CEHHS',
    depts:['Counseling & Psychological Services','Educational Leadership & Policy Studies',
      'Educational Psychology & Learning Systems','Health Education & Behavior',
      'Kinesiology','Nutrition, Food & Exercise Sciences',
      'Special Education & School Psychology','Sport Management'],
  },
  'FAMU-FSU College of Engineering': {
    abbr:'ENG',
    depts:['Chemical & Biomedical Engineering','Civil & Environmental Engineering',
      'Electrical & Computer Engineering','Industrial & Manufacturing Engineering',
      'Mechanical Engineering'],
  },
  'Jim Moran College of Entrepreneurship': {
    abbr:'JMC',
    depts:['Entrepreneurship'],
  },
  'College of Fine Arts': {
    abbr:'CFA',
    depts:['Art','Art Education','Art History','Dance','Interior Architecture & Design','Theatre'],
  },
  'Dedman College of Hospitality': {
    abbr:'DCH',
    depts:['Dedman School of Hospitality'],
  },
  'College of Law': {
    abbr:'LAW',
    depts:['Law'],
  },
  'College of Medicine': {
    abbr:'MED',
    depts:['Biomedical Sciences','Behavioral Sciences & Social Medicine','Clinical Sciences',
      'Geriatrics','Medical Humanities & Social Sciences','Physician Assistant Practice'],
  },
  'College of Motion Picture Arts': {
    abbr:'MPA',
    depts:['Motion Picture Arts'],
  },
  'College of Music': {
    abbr:'MUS',
    depts:['Music Education','Music Performance','Music Theory & Composition'],
  },
  'College of Nursing': {
    abbr:'NUR',
    depts:['Nursing'],
  },
  'College of Social Sciences and Public Policy': {
    abbr:'COSSPP',
    depts:['Economics','Geography','International Affairs',
      'Political Science','Sociology','Urban & Regional Planning'],
  },
  'College of Social Work': {
    abbr:'CSW',
    depts:['Social Work'],
  },
  'College of Applied Studies': {
    abbr:'CAS2',
    depts:['Applied Studies — Panama City Campus'],
  },
}

// ── Four agent definitions ────────────────────────────────────────
export const AGENT_DEFS = [
  {
    num:'01', name:'Performance Monitor', role:'Agent 1',
    color:'#0D7377', colorL:'#E6F4F4', icon:'📡',
    tagline:'Captures every AI interaction in real time',
    desc:'Deployed as middleware across all AI platforms. Records output quality via LLM-as-judge scoring, latency, token efficiency, prompt structure (PMI 1-5), and engagement depth without disrupting operations.',
    tech:'Cloud Run · FastAPI · Google Workspace Admin SDK · Microsoft Graph API · Canvas LTI',
    signals:['Output quality score (0–100)','Response latency','Token efficiency',
      'Prompt Maturity Index (PMI 1–5)','Engagement depth','Cost per session'],
  },
  {
    num:'02', name:'Degradation Diagnostician', role:'Agent 2',
    color:'#1A3E6B', colorL:'#E8EFF8', icon:'🔬',
    tagline:'Classifies exactly why performance is declining',
    desc:'Applies CUSUM (Cumulative Sum Control Charts) statistical process control to detect when performance has shifted from its baseline, then classifies the root cause into one of three drift types.',
    tech:'BigQuery · Python · SciPy · Statsmodels · CUSUM statistical process control',
    signals:['Model drift — API/model changed','Prompt drift — user queries weakened',
      'Context drift — usage domain shifted','Cross-tool discrepancies',
      'Severity scoring (low / medium / high)','Baseline vs. current comparison'],
  },
  {
    num:'03', name:'Recommendation Engine (COACH)', role:'Agent 3',
    color:'#C47B2B', colorL:'#FBF2E3', icon:'🧠',
    tagline:'Closes the loop from detection to correction',
    desc:'Powered by a large language model via AWS Bedrock. Operates at three levels: coaching individual users with in-context prompt rewrites, recommending model routing changes to administrators, and generating validated prompt templates. Every action is audited.',
    tech:'AWS Bedrock Agents · Foundation model via Bedrock · Bedrock Guardrails · AWS CloudWatch',
    signals:['User-level prompt coaching','Institutional model routing',
      'System template optimization','A/B test validation',
      'Human approval workflow','CloudWatch audit trail'],
  },
  {
    num:'04', name:'Reporting Engine', role:'Agent 4',
    color:'#6B2D8E', colorL:'#F2EAF8', icon:'📊',
    tagline:'Surfaces insights to the right people at the right level',
    desc:'Generates the college-level interactive dashboard, longitudinal trend reports, cross-unit benchmarking, intervention outcome tracking, and FERPA-compliant research exports. Role-based access via AWS IAM.',
    tech:'React · Recharts · BigQuery SQL · AWS IAM role-based access controls',
    signals:['College-level dashboard','Cross-college benchmarking',
      'Intervention outcome tracking','SDL behavioral exports',
      'FERPA-compliant CSVs','Longitudinal trend reports'],
  },
]
