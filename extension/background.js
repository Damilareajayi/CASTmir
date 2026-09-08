/**
 * CASTmir — background service worker.
 *
 * Monitoring on a given site only starts after two separate approvals:
 *   1. Research consent (RECAST alias, one-time, global) — handled in popup.js.
 *   2. A per-site browser permission grant, requested via a native prompt
 *      triggered from a user gesture in the popup — handled here.
 * Until both are true for a given tab's origin, no content script runs on
 * it and the toolbar icon shows the muted "not authorized" state.
 */
import './vendor/browser-polyfill.js'

const API_BASE_URL = 'https://5vpmkv6yjy.us-east-1.awsapprunner.com'

export const SUPPORTED_SITES = [
  { pattern: 'https://chatgpt.com/*', origin: 'https://chatgpt.com' },
  { pattern: 'https://chat.openai.com/*', origin: 'https://chat.openai.com' },
  { pattern: 'https://gemini.google.com/*', origin: 'https://gemini.google.com' },
  { pattern: 'https://claude.ai/*', origin: 'https://claude.ai' },
  { pattern: 'https://copilot.microsoft.com/*', origin: 'https://copilot.microsoft.com' },
  { pattern: 'https://www.perplexity.ai/*', origin: 'https://www.perplexity.ai' },
]

function siteFor(url) {
  if (!url) return null
  return SUPPORTED_SITES.find(s => url.startsWith(s.origin)) || null
}

async function ensureUserHash() {
  const stored = await browser.storage.local.get('castmir_user_hash')
  if (stored.castmir_user_hash) return stored.castmir_user_hash
  const hash = crypto.randomUUID()
  await browser.storage.local.set({ castmir_user_hash: hash })
  return hash
}

async function hasSitePermission(origin) {
  return browser.permissions.contains({ origins: [`${origin}/*`] })
}

// ── Content script registration ─────────────────────────────────────────
// IMPORTANT: dynamically-registered content scripts (via
// scripting.registerContentScripts) do NOT survive an extension reload —
// they're wiped along with the service worker's in-memory state. Browser
// *permission* grants DO survive reloads (Chrome persists those itself).
// That mismatch is a real bug we hit: after reloading the extension, a
// previously-authorized site still shows as "authorized" (permission is
// still granted) but content.js silently stops injecting (the registration
// that made that happen is gone) — with no error anywhere, since the old
// code also swallowed registration errors via `.catch(() => {})`.
// Fix: re-sync registrations against actual granted permissions every time
// the service worker starts, not just at the moment of authorization.
function contentScriptFor(origin) {
  return {
    id: `castmir-${origin}`,
    matches: [`${origin}/*`],
    js: ['vendor/browser-polyfill.js', 'content.js'],
    runAt: 'document_idle',
  }
}

async function registerContentScriptForOrigin(origin) {
  const script = contentScriptFor(origin)
  try {
    await browser.scripting.registerContentScripts([script])
    console.log('[CASTmir] registered content script for', origin)
  } catch (err) {
    // Most likely cause: an ID already registered from an earlier session —
    // update it instead so edits to content.js actually take effect.
    try {
      await browser.scripting.updateContentScripts([script])
      console.log('[CASTmir] updated existing content script registration for', origin)
    } catch (err2) {
      console.error('[CASTmir] FAILED to register or update content script for', origin, err2)
    }
  }
}

async function syncContentScriptRegistrations() {
  const granted = await browser.permissions.getAll()
  const origins = (granted.origins || []).map(p => p.replace(/\/\*$/, ''))
  console.log('[CASTmir] syncing content script registrations for granted origins:', origins)
  for (const origin of origins) {
    if (SUPPORTED_SITES.some(s => s.origin === origin)) await registerContentScriptForOrigin(origin)
  }
}
// Runs every time the service worker starts — covers extension reloads,
// browser restarts, and Chrome unloading an idle service worker.
syncContentScriptRegistrations()

// ── Remote site-selector config ───────────────────────────────────────────
// Fetched here (not from content.js directly) so every tab on the same site
// shares one cached copy instead of each making its own request. content.js
// reads the cached result from browser.storage.local and merges it over its
// bundled defaults — see content.js's resolveConfig() block for why that's
// safe to do without a bigger async refactor there.
async function fetchAndCacheSiteConfigs() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/site-configs`)
    if (!res.ok) return
    const data = await res.json()
    await browser.storage.local.set({ castmir_remote_site_configs: data, castmir_remote_site_configs_fetched_at: Date.now() })
    console.log('[CASTmir] refreshed remote site configs')
  } catch (err) {
    // Bundled defaults in content.js are always a safe fallback — a failed
    // fetch here (offline, backend hiccup) shouldn't break capture.
    console.error('[CASTmir] failed to fetch remote site configs — bundled defaults still apply', err)
  }
}
fetchAndCacheSiteConfigs()

// Re-checks periodically (not just at service-worker startup, which on a
// long-lived browser session might not happen again for days) so a backend
// selector fix reaches already-open tabs' next page load within hours, not
// only after the next browser restart.
browser.alarms.create('castmir-refresh-site-configs', { periodInMinutes: 360 })
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'castmir-refresh-site-configs') fetchAndCacheSiteConfigs()
})

// content.js calls browser.storage.session in ensureSession() to track a
// per-tab session id. MV3 blocks storage.session from content-script
// contexts by default ("Access to storage is not allowed from this
// context") unless the background worker explicitly raises the access
// level — this is a one-time-feeling setting that's safest to re-apply on
// every service worker start, same reasoning as the registration sync above.
if (chrome?.storage?.session?.setAccessLevel) {
  chrome.storage.session
    .setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
    .then(() => console.log('[CASTmir] granted content scripts access to storage.session'))
    .catch(err => console.error('[CASTmir] failed to set storage.session access level', err))
}

// ── Per-tab icon state ──────────────────────────────────────────────────
// The popup always opens on click (setPopup is set unconditionally below)
// rather than jumping straight to the dashboard on fully-active tabs — the
// "Open full dashboard" button inside the popup covers that need instead.
//
// Badge carries real signal now instead of a static "monitoring on" dot —
// a permanently-on badge at toolbar-icon scale reads as visual noise and
// crowds out the icon art itself. It now only lights up for something
// actually worth noticing: a security alert (red) takes priority over a
// weak-prompt nudge (amber, with the same missing-dimension count shown in
// the inline coach widget) over nothing at all (no badge). Cleared whenever
// the tab navigates so a stale signal from a previous page never lingers.
const tabStatus = new Map() // tabId -> { alert: boolean, missing: number }

function badgeForStatus(status) {
  if (status?.alert) return { text: '!', color: '#C0392B' }
  if (status?.missing > 0) return { text: String(status.missing), color: '#E0A62D' }
  return { text: '', color: '#1E6B3C' }
}

async function applyBadgeForTab(tabId) {
  const { text, color } = badgeForStatus(tabStatus.get(tabId))
  await browser.action.setBadgeText({ tabId, text })
  await browser.action.setBadgeBackgroundColor({ tabId, color })
}

async function updateIconForTab(tabId, url) {
  const site = siteFor(url)
  if (!site) {
    await browser.action.setIcon({ tabId, path: iconSet('inactive') })
    await browser.action.setBadgeText({ tabId, text: '' })
    await browser.action.setPopup({ tabId, popup: 'popup.html' })
    return
  }
  const authorized = await hasSitePermission(site.origin)
  const { castmir_consented } = await browser.storage.local.get('castmir_consented')
  const fullyActive = authorized && castmir_consented

  await browser.action.setIcon({ tabId, path: iconSet(fullyActive ? 'active' : 'inactive') })
  await applyBadgeForTab(tabId)
  await browser.action.setPopup({ tabId, popup: 'popup.html' }) // always show popup, see note above
  await browser.action.setTitle({
    tabId,
    title: fullyActive
      ? 'CASTmir — monitoring this tab. Click for your dashboard.'
      : `CASTmir — setup needed on ${site.origin}. Click to continue.`,
  })
}

function iconSet(state) {
  const suffix = state === 'active' ? '' : '-inactive'
  return { 16: `icons/icon-16${suffix}.png`, 48: `icons/icon-48${suffix}.png`, 128: `icons/icon-128${suffix}.png` }
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) tabStatus.delete(tabId) // fresh navigation — any prior signal no longer applies
  if (changeInfo.status === 'complete' || changeInfo.url) updateIconForTab(tabId, tab.url)
})
browser.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await browser.tabs.get(tabId)
  updateIconForTab(tabId, tab.url)
})
browser.tabs.onRemoved.addListener((tabId) => {
  tabStatus.delete(tabId)
})

// ── Authorization flow — called from popup.js on a user gesture ──────────
async function authorizeSite(origin) {
  const granted = await browser.permissions.request({ origins: [`${origin}/*`] })
  if (!granted) {
    console.log('[CASTmir] user declined the permission prompt for', origin)
    return false
  }

  // Dynamic registration covers future navigations/reloads on this origin;
  // executeScript covers the tab that's open right now, since registration
  // alone doesn't retroactively inject into already-loaded pages.
  await registerContentScriptForOrigin(origin)

  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (activeTab?.url?.startsWith(origin)) {
    try {
      await browser.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['vendor/browser-polyfill.js', 'content.js'],
      })
      console.log('[CASTmir] injected into the current tab immediately:', activeTab.id)
    } catch (err) {
      console.error('[CASTmir] FAILED to inject into the current tab', err)
    }
    await updateIconForTab(activeTab.id, activeTab.url)
  }
  return true
}

// ── Messages from popup.js and content.js ─────────────────────────────────
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'CASTmir_AUTHORIZE_SITE') {
    return authorizeSite(message.origin)
  }

  if (message.type === 'CASTmir_CHECK_SITE') {
    const site = siteFor(message.url)
    if (!site) return Promise.resolve({ supported: false })
    return hasSitePermission(site.origin).then(authorized => ({ supported: true, origin: site.origin, authorized }))
  }

  if (message.type === 'CASTmir_COACH_REWRITE') {
    return rewriteWithCoach(message.prompt, message.tool, message.session_id)
  }

  if (message.type === 'CASTmir_SESSION_EVENT') {
    return handleSessionEvent(message.payload, sender.tab?.id)
  }

  if (message.type === 'CASTmir_PROMPT_QUALITY_STATUS') {
    const tabId = sender.tab?.id
    if (tabId == null) return Promise.resolve()
    const existing = tabStatus.get(tabId) || {}
    tabStatus.set(tabId, { ...existing, missing: message.missing || 0 })
    return applyBadgeForTab(tabId)
  }

  if (message.type === 'CASTmir_REFRESH_ICON') {
    return browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab) return updateIconForTab(tab.id, tab.url)
    })
  }

  if (message.type === 'CASTmir_OPEN_DASHBOARD') {
    return ensureUserHash().then(userHash =>
      browser.tabs.create({ url: `${API_BASE_URL}/?hash=${encodeURIComponent(userHash)}#user` }),
    )
  }

  // popup.js's consent screen needs a real hash to register the alias
  // against BEFORE any session has ever been captured (that's the only
  // other path that lazily creates one, via handleSessionEvent below) — a
  // popup-local storage.local.get() that doesn't create one on a miss
  // silently sent user_hash: undefined in the registration POST on a
  // user's very first consent, which JSON.stringify drops entirely,
  // making the whole request fail with no visible error anywhere. Routing
  // through ensureUserHash() here keeps hash creation in one place instead
  // of duplicating that logic in popup.js.
  if (message.type === 'CASTmir_ENSURE_USER_HASH') {
    return ensureUserHash()
  }

  if (message.type === 'CASTmir_SELECTOR_HEALTH') {
    return fetch(`${API_BASE_URL}/api/selector-health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostname: message.hostname, tool: message.tool, prompt_input_found: message.prompt_input_found,
      }),
    }).catch(() => {}) // a missed health ping shouldn't surface as an error anywhere
  }

  // Nothing wrote to the interventions table before this — the "Recent
  // COACH suggestions" panel on every dashboard was permanently empty by
  // construction, not from a query bug. content.js sends this right after
  // a rewrite is actually shown to the user.
  if (message.type === 'CASTmir_LOG_INTERVENTION') {
    return ensureUserHash().then(userHash =>
      fetch(`${API_BASE_URL}/api/coach/intervention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...message.payload, user_hash: userHash }),
      }),
    ).catch(() => {}) // a missed log shouldn't surface as an error anywhere
  }
})

// Prompt construction, history lookup, and response parsing all now live
// server-side (backend-py/agents/coach.py) — this used to duplicate that
// logic here AND in frontend/src/api.js, which had already drifted out of
// sync between the two copies. Passing user_hash lets the backend pull the
// user's own recent prompt history and ground the rewrite in real specifics
// instead of leaving generic bracketed placeholders for the user to fill in.
// session_id lets it separate "this same conversation" (safe to draw on)
// from "other past conversations" (only relevant if the subject actually
// matches) instead of treating the last 5 prompts from ANY conversation as
// equally relevant — see agents/coach.py's docstring.
async function rewriteWithCoach(originalPrompt, tool, sessionId) {
  try {
    const userHash = await ensureUserHash()
    const res = await fetch(`${API_BASE_URL}/api/coach/rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: originalPrompt, tool, user_hash: userHash, session_id: sessionId, max_tokens: 900 }),
    })
    if (!res.ok) return { ok: false, error: `coach/rewrite -> ${res.status}` }
    const parsed = await res.json()
    return { ok: true, data: parsed }
  } catch (err) {
    console.error('[CASTmir] COACH rewrite failed', err)
    return { ok: false, error: String(err) }
  }
}

async function handleSessionEvent(payload, tabId) {
  const userHash = await ensureUserHash()
  try {
    const res = await fetch(`${API_BASE_URL}/api/session/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, user_hash: userHash }),
    })
    const data = await res.json()
    if (data.alert) {
      browser.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-128.png',
        title: `CASTmir — ${data.alert.headline}`,
        message: data.alert.message,
        priority: 2,
      })
      if (tabId != null) {
        const existing = tabStatus.get(tabId) || {}
        tabStatus.set(tabId, { ...existing, alert: true })
        await applyBadgeForTab(tabId)
      }
    }
    return { ok: true, data }
  } catch (err) {
    console.error('[CASTmir] failed to report session event', err)
    return { ok: false, error: String(err) }
  }
}
