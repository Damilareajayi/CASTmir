const API_BASE_URL = 'https://5vpmkv6yjy.us-east-1.awsapprunner.com'

const screens = {
  unsupported: document.getElementById('unsupported'),
  authorize: document.getElementById('authorize'),
  consent: document.getElementById('consent'),
  dashboard: document.getElementById('dashboard'),
}

function show(name) {
  for (const [key, el] of Object.entries(screens)) el.classList.toggle('hidden', key !== name)
}

async function getUserHash() {
  // Creates one if none exists yet — see background.js's
  // CASTmir_ENSURE_USER_HASH handler for why this can't be a plain
  // storage.local read here (that silently broke first-time consent).
  return browser.runtime.sendMessage({ type: 'CASTmir_ENSURE_USER_HASH' })
}

async function dashboardUrl() {
  const hash = await getUserHash()
  return `${API_BASE_URL}/?hash=${encodeURIComponent(hash)}#user`
}

async function init() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  const site = await browser.runtime.sendMessage({ type: 'CASTmir_CHECK_SITE', url: tab?.url })

  if (!site.supported) {
    show('unsupported')
    return
  }

  if (!site.authorized) {
    document.getElementById('authorize-site').textContent = new URL(site.origin).hostname
    show('authorize')
    return
  }

  const { castmir_consented } = await browser.storage.local.get('castmir_consented')
  if (castmir_consented) {
    show('dashboard')
    loadDashboard()
  } else {
    show('consent')
    document.getElementById('alias-input').focus()
  }
}

document.getElementById('authorize-btn').addEventListener('click', async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  const site = await browser.runtime.sendMessage({ type: 'CASTmir_CHECK_SITE', url: tab?.url })
  const granted = await browser.runtime.sendMessage({ type: 'CASTmir_AUTHORIZE_SITE', origin: site.origin })
  if (granted) init() // re-evaluate — moves on to consent or dashboard
})

document.getElementById('alias-input').addEventListener('input', (e) => {
  document.getElementById('consent-btn').disabled = e.target.value.trim().length < 2
})

async function registerAlias(userHash, alias) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_hash: userHash, alias, extension_version: browser.runtime.getManifest().version }),
    })
    return res.ok
  } catch {
    return false
  }
}

document.getElementById('consent-btn').addEventListener('click', async () => {
  const alias = document.getElementById('alias-input').value.trim()
  if (!alias) return

  const userHash = await getUserHash()
  const hint = document.getElementById('alias-hint')

  // A failed registration used to be entirely silent — local consent still
  // proceeded either way, with nothing anywhere indicating the alias never
  // reached the server (see background.js's CASTmir_ENSURE_USER_HASH
  // comment for the actual bug that caused this on first-time consent).
  // One retry covers a transient network blip; if it's still failing after
  // that, say so before moving on instead of pretending it worked.
  let ok = await registerAlias(userHash, alias)
  if (!ok) {
    await new Promise(r => setTimeout(r, 500))
    ok = await registerAlias(userHash, alias)
  }
  if (!ok) {
    hint.textContent = "Couldn't reach CASTmir's server to save your alias — continuing anyway, but the admin team won't see your activity until this succeeds. Try reopening this popup in a moment."
    hint.style.color = '#C0392B'
    console.error('[CASTmir] alias registration failed after retry for', alias)
    await new Promise(r => setTimeout(r, 2200)) // let them actually read it before the screen changes
  }

  await browser.storage.local.set({ castmir_consented: true, castmir_alias: alias })
  browser.runtime.sendMessage({ type: 'CASTmir_REFRESH_ICON' }) // next click opens the full dashboard, not this popup
  show('dashboard')
  loadDashboard()
})

async function loadDashboard() {
  const userHash = await getUserHash()
  try {
    const res = await fetch(`${API_BASE_URL}/api/user/${userHash}/dashboard`)
    const data = await res.json()

    const qualities = data.quality_trend?.map(r => r.quality).filter(Boolean) ?? []
    const pmis = data.pmi_trend?.map(r => r.pmi).filter(Boolean) ?? []
    const sessions = data.tool_breakdown?.reduce((sum, t) => sum + t.sessions, 0) ?? 0

    document.getElementById('kpi-quality').textContent =
      qualities.length ? `${Math.round(qualities.reduce((a, b) => a + b) / qualities.length)}%` : '—'
    document.getElementById('kpi-pmi').textContent =
      pmis.length ? (pmis.reduce((a, b) => a + b) / pmis.length).toFixed(1) : '—'
    document.getElementById('kpi-sessions').textContent = sessions

    const alertsEl = document.getElementById('alerts')
    for (const evt of (data.security_events ?? []).slice(0, 3)) {
      const div = document.createElement('div')
      div.className = 'alert-item'
      div.textContent = `${evt.severity.toUpperCase()} — ${evt.threat_type.replace(/_/g, ' ')}`
      alertsEl.appendChild(div)
    }
  } catch (err) {
    console.error('[CASTmir] popup dashboard fetch failed', err)
  }
}

document.getElementById('open-dashboard-btn').addEventListener('click', async () => {
  browser.tabs.create({ url: await dashboardUrl() })
})

init()
