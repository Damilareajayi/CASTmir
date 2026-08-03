/**
 * Data source adapter: synthetic (oasst1 + synthetic FSU metadata)
 * Thin re-export of aggregate.js — this is the original/default source,
 * kept as its own adapter so it plugs into the same registry as the
 * ReliaQuest and FSU ITS sources.
 */
import * as agg from '../aggregate.js'
import { FSU_COLLEGES } from '../constants.js'

export const meta = {
  id: 'synthetic',
  label: 'Synthetic (oasst1 pilot)',
  status: 'active',
  description: 'Real prompt text from OpenAssistant/oasst1, with synthetic FSU institutional metadata layered on top.',
  capabilities: {
    hasGroups: true,
    groupLabel: 'College',
    groupOptions: Object.keys(FSU_COLLEGES),
    hasDepartments: true,
  },
}

export const getSummaryKPIs       = agg.getSummaryKPIs
export const getAccuracyTrends    = agg.getAccuracyTrends
export const getSessionVolume     = agg.getSessionVolume
export const getGroupBreakdown    = agg.getCollegeBreakdown
export const getModelComparison   = agg.getModelComparison
export const getDriftEvents       = agg.getDriftEvents
export const getDriftDistribution = agg.getDriftDistribution
export const getPmiDistribution   = agg.getPmiDistribution
