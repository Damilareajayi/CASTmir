/**
 * CASTmir — API client for backend-py.
 * VITE_API_URL='SAME_ORIGIN' when the frontend is served by backend-py
 * itself (production — see backend-py/main.py's static mount). Defaults to
 * the live App Runner service for local frontend dev against the deployed
 * API; set it to http://localhost:8001 in .env for local backend-py too.
 */
const rawApiUrl = import.meta.env.VITE_API_URL
const BASE = rawApiUrl === 'SAME_ORIGIN' ? '' : (rawApiUrl || 'https://5vpmkv6yjy.us-east-1.awsapprunner.com')

async function get(path, adminToken) {
  const res = await fetch(`${BASE}${path}`, {
    headers: adminToken ? { 'X-Admin-Token': adminToken } : {},
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

export const getUserDashboard  = (userHash, days = 30)        => get(`/api/user/${userHash}/dashboard?days=${days}`)
export const getAdminDashboard = (days = 30, adminToken)      => get(`/api/admin/dashboard?days=${days}`, adminToken)
export const getSecurityEvents = (adminToken)                 => get('/api/admin/security-events', adminToken)
export const getDriftEvents    = (adminToken)                 => get('/api/admin/drift-events', adminToken)
export const getActiveAlerts   = (adminToken)                 => get('/api/admin/alerts', adminToken)
export const getAdminUserDashboard = (identity, days = 30, adminToken) =>
  get(`/api/admin/users/${encodeURIComponent(identity)}/dashboard?days=${days}`, adminToken)
export const getSelectorHealth = (hours = 24, adminToken) =>
  get(`/api/admin/selector-health?hours=${hours}`, adminToken)
