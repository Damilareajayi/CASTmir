/**
 * CASTmir backend — shared constants (mirrors src/constants.js on the frontend)
 */

export const MODELS = [
  { id: 'gpt-4',         name: 'GPT-4',        baseline: 88.4 },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5',      baseline: 79.1 },
  { id: 'claude-3.5',    name: 'Claude 3.5',   baseline: 91.2 },
  { id: 'gemini-pro',    name: 'Gemini Pro',   baseline: 83.7 },
  { id: 'copilot',       name: 'Copilot',      baseline: 81.3 },
  { id: 'llama-2-70b',   name: 'Llama 2 70B',  baseline: 78.0 },
  { id: 'mistral-7b',    name: 'Mistral 7B',   baseline: 75.4 },
  { id: 'palm-2',        name: 'PaLM 2',       baseline: 82.1 },
]

// Models that drift downward in the back half of the window — keeps the
// drift-detection story (CUSUM alarms, Alerts tab) meaningful over real data.
export const DRIFTING_MODELS = new Set(['GPT-3.5', 'Copilot'])

export const FSU_COLLEGES = {
  'College of Arts and Sciences': {
    abbr: 'CAS',
    depts: ['Anthropology','Biological Science','Chemistry & Biochemistry','Classics',
      'Computer Science','Earth, Ocean & Atmospheric Science','English','History',
      'Mathematics','Modern Languages & Linguistics','Philosophy','Physics',
      'Psychology','Religion','Scientific Computing','Statistics'],
  },
  'Herbert Wertheim College of Business': {
    abbr: 'COB',
    depts: ['Accounting','Finance','Management','Management Information Systems',
      'Marketing','Risk Management & Insurance'],
  },
  'College of Communication and Information': {
    abbr: 'CCI',
    depts: ['Communication','Information','Library & Information Studies'],
  },
  'College of Criminology and Criminal Justice': {
    abbr: 'CCCJ',
    depts: ['Criminology & Criminal Justice'],
  },
  'Anne Spencer Daves College of Education, Health, and Human Sciences': {
    abbr: 'CEHHS',
    depts: ['Counseling & Psychological Services','Educational Leadership & Policy Studies',
      'Educational Psychology & Learning Systems','Health Education & Behavior',
      'Kinesiology','Nutrition, Food & Exercise Sciences',
      'Special Education & School Psychology','Sport Management'],
  },
  'FAMU-FSU College of Engineering': {
    abbr: 'ENG',
    depts: ['Chemical & Biomedical Engineering','Civil & Environmental Engineering',
      'Electrical & Computer Engineering','Industrial & Manufacturing Engineering',
      'Mechanical Engineering'],
  },
  'Jim Moran College of Entrepreneurship': {
    abbr: 'JMC',
    depts: ['Entrepreneurship'],
  },
  'College of Fine Arts': {
    abbr: 'CFA',
    depts: ['Art','Art Education','Art History','Dance','Interior Architecture & Design','Theatre'],
  },
  'Dedman College of Hospitality': {
    abbr: 'DCH',
    depts: ['Dedman School of Hospitality'],
  },
  'College of Law': {
    abbr: 'LAW',
    depts: ['Law'],
  },
  'College of Medicine': {
    abbr: 'MED',
    depts: ['Biomedical Sciences','Behavioral Sciences & Social Medicine','Clinical Sciences',
      'Geriatrics','Medical Humanities & Social Sciences','Physician Assistant Practice'],
  },
  'College of Motion Picture Arts': {
    abbr: 'MPA',
    depts: ['Motion Picture Arts'],
  },
  'College of Music': {
    abbr: 'MUS',
    depts: ['Music Education','Music Performance','Music Theory & Composition'],
  },
  'College of Nursing': {
    abbr: 'NUR',
    depts: ['Nursing'],
  },
  'College of Social Sciences and Public Policy': {
    abbr: 'COSSPP',
    depts: ['Economics','Geography','International Affairs',
      'Political Science','Sociology','Urban & Regional Planning'],
  },
  'College of Social Work': {
    abbr: 'CSW',
    depts: ['Social Work'],
  },
  'College of Applied Studies': {
    abbr: 'CAS2',
    depts: ['Applied Studies — Panama City Campus'],
  },
}
