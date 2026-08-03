/**
 * Data source adapter: FSU ITS (pending)
 * FSU ITS hasn't built the deidentified-usage API yet and the schema
 * isn't defined, so unlike the ReliaQuest adapter this one does NOT
 * fabricate placeholder numbers — status:'pending' tells the frontend to
 * show a "coming soon" panel instead of charts. Once ITS delivers an API
 * contract, replace these stubs with real queries (and fill in
 * meta.capabilities to match whatever dimensions their data actually has).
 */
export const meta = {
  id: 'fsu_its',
  label: 'FSU ITS (pending)',
  status: 'pending',
  description: 'Awaiting a deidentified AI-usage API from FSU ITS — data shape is not yet defined.',
  capabilities: {
    hasGroups: false,
    groupLabel: null,
    groupOptions: [],
    hasDepartments: false,
  },
}

export function getSummaryKPIs(days) {
  return {
    overall_accuracy: 0, accuracy_change: 0, total_sessions: 0, sessions_change: 0,
    active_alerts: 0, interventions: 0, models_tracked: 0, colleges_covered: 0,
    period_days: days, data_source: 'FSU ITS — API not yet available',
  }
}
export function getAccuracyTrends()    { return [] }
export function getSessionVolume()     { return [] }
export function getGroupBreakdown()    { return [] }
export function getModelComparison()   { return [] }
export function getDriftEvents()       { return [] }
export function getDriftDistribution() { return [] }
export function getPmiDistribution()   { return [] }
