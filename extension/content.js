/**
 * CASTmir — content script.
 *
 * Captures both the derived structural signals (word count, role framing,
 * format/constraint language) AND the raw prompt/response text, per the
 * updated consent model: installing and enabling CASTmir on a site means
 * consenting to content capture, disclosed on the same consent screen the
 * user approves before monitoring starts (see popup.html). Content is used
 * to score prompt/response quality directly and to improve Agent 1's
 * training data over time.
 *
 * IMPORTANT: the CSS selectors in SITE_CONFIGS are best-effort based on each
 * site's general DOM patterns, NOT verified against the live pages — I don't
 * have a working headless-browser session in this environment to confirm
 * them. These WILL need adjustment against the real sites before this is
 * anything more than a scaffold. Treat every selector below as a TODO.
 *
 * DEBUGGING: every step below logs to the console prefixed "[CASTmir]" —
 * open DevTools (F12) → Console on the AI site's tab to see exactly where
 * capture is succeeding or failing.
 */

// Bundled fallback only — the live source of truth is the backend's
// site_configs table (GET /api/site-configs), fetched by background.js and
// cached in browser.storage.local. This copy exists so capture still works
// on the very first page load (before that fetch resolves) or if the fetch
// ever fails, and so the extension isn't fully useless offline. When an AI
// site changes its DOM and breaks a selector, fix it via one admin PUT to
// /api/admin/site-configs/{hostname} instead of shipping a new extension
// version and waiting for users to update — see resolveConfig() below for
// how the remote override gets applied.
const DEFAULT_SITE_CONFIGS = {
  'chatgpt.com': {
    // Verified against live chatgpt.com DOM on 2026-08-29: composer is a real
    // <textarea id="mobile-composer-prompt">, not the contenteditable div
    // "#prompt-textarea" was guessed as. responseContainer uses the stable
    // data-assistant-markdown attribute instead of the CSS-modules hashed
    // class name (e.g. "_wdUoQG_assistantMessage"), which will likely change
    // on ChatGPT's next deploy.
    tool: 'ChatGPT',
    promptInput: '#mobile-composer-prompt',
    submitButton: '[data-testid="send-button"]', // TODO: unconfirmed — awaiting real <button> markup, only the inner <svg> was captured so far
    responseContainer: '[data-assistant-markdown]',
    modelVersionSelector: null, // TODO: find where ChatGPT exposes the active model in the DOM
  },
  'chat.openai.com': { extends: 'chatgpt.com' },
  'claude.ai': {
    // Verified against live claude.ai DOM on 2026-08-29: promptInput was
    // already correct. responseContainer was wrong — this build exposes no
    // data-testid at all on the response container; using the semantically-
    // named "font-claude-response" class instead of the generic ".prose" /
    // ".standard-markdown" ancestors, which likely aren't unique to assistant
    // turns.
    tool: 'Claude',
    promptInput: '[data-testid="chat-input"]',
    submitButton: '[aria-label="Send Message"]', // TODO: unconfirmed — Enter-to-send worked in testing, click path untested
    responseContainer: '.font-claude-response',
    modelVersionSelector: null,
  },
  'gemini.google.com': {
    // Verified against live gemini.google.com DOM on 2026-08-29:
    // input is a plain contenteditable div (no confirmed <rich-textarea>
    // ancestor requirement — dropped it), response is the rendered-markdown
    // panel, NOT a <model-response> element as originally guessed.
    tool: 'Gemini',
    promptInput: 'div.ql-editor[contenteditable="true"]',
    submitButton: 'button[aria-label="Send message"]', // TODO: unconfirmed — awaiting real <button> markup, only the inner <mat-icon> was captured so far
    responseContainer: '.markdown-main-panel.md-content',
    modelVersionSelector: null,
  },
  'copilot.microsoft.com': {
    // Verified against live copilot.microsoft.com DOM on 2026-08-29:
    // promptInput was already correct (a real <textarea id="userInput">).
    // responseContainer went through two wrong guesses: [data-content=...]
    // (attribute doesn't exist) then [class*="ai-message-item"] (real, but
    // ALSO matches a trailing "Edit in a page" action link and empty
    // citation-button wrappers for the same turn — since those render after
    // the actual content, "last match in the DOM" grabbed the 14-char
    // button label instead of the real response). The content div's id
    // reliably ends in "-content-N" (e.g. "hP4PRTi4oMsDhMi3FbrJT-content-0")
    // and nothing else shares that pattern, so match on that instead.
    tool: 'Copilot',
    promptInput: '#userInput',
    submitButton: '[aria-label="Submit message"]', // TODO: still unconfirmed — Enter-to-send worked in testing, click path untested
    responseContainer: '[id*="-content-"]',
    modelVersionSelector: null,
  },
  'www.perplexity.ai': {
    // Verified against live perplexity.ai DOM on 2026-08-29: the ask box is
    // a contenteditable Lexical editor div, not a <textarea> as originally
    // guessed — has a real, stable id="ask-input".
    tool: 'Perplexity',
    promptInput: '#ask-input',
    // responseContainer: no data-testid exists on any ancestor of the answer
    // text; "group/final-text" (Tailwind named-group syntax, same pattern as
    // Copilot's "ai-message-item") is the real, intentional marker instead.
    submitButton: 'button[aria-label="Submit"]', // TODO: still unconfirmed
    responseContainer: '[class*="final-text"]',
    modelVersionSelector: null,
  },
}

function log(...args) { console.log('[CASTmir]', ...args) }
function warn(...args) { console.warn('[CASTmir]', ...args) }

function resolveConfig(hostname) {
  const raw = DEFAULT_SITE_CONFIGS[hostname]
  if (!raw) return null
  return raw.extends ? DEFAULT_SITE_CONFIGS[raw.extends] : raw
}

// ── Generic prompt-input detection — the same technique tools like
// Grammarly use to stay resilient no matter how often a site's DOM
// changes: HTML's own semantics for "this accepts text" (a <textarea>, a
// contenteditable element, role="textbox") never change, even when a
// site renames its CSS classes or data-testid values on every redesign.
// config.promptInput above is still tried FIRST everywhere and used
// whenever it matches something — it's more precise (a page can have
// several generic-looking text inputs; the specific selector is what
// picks the right one on purpose). This is only a fallback for when the
// specific selector finds nothing at all on the page, which is the
// signature of an actual DOM change rather than normal async rendering. ──
function isGenericTextInput(el) {
  if (!el || el.nodeType !== 1) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'textarea') return true
  if (tag === 'input') {
    const type = (el.getAttribute('type') || 'text').toLowerCase()
    return type === 'text' || type === 'search'
  }
  if (el.isContentEditable) return true
  if (el.getAttribute('role') === 'textbox') return true
  return false
}

function isVisibleCandidate(el) {
  const rect = el.getBoundingClientRect()
  // A chat composer is almost always the widest visible text input on the
  // page — filters out things like a small inline search box or a hidden
  // template element without needing to know anything site-specific.
  return rect.width > 120 && rect.height > 10 && el.offsetParent !== null
}

// The widest visible generic candidate, since a main composer is reliably
// more prominent than incidental text inputs (search boxes, rename
// fields, etc.) elsewhere on the page.
function findGenericPromptInput() {
  const candidates = Array.from(document.querySelectorAll('textarea, input, [contenteditable="true"], [role="textbox"]'))
    .filter(isGenericTextInput)
    .filter(isVisibleCandidate)
  if (!candidates.length) return null
  candidates.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)
  return candidates[0]
}

// Resolves to a real element: the specific selector if it matches
// anything, otherwise the best generic candidate. Returns { el, via } so
// callers (and the health-check ping) can tell which path actually found
// it — real operational signal for whether a site has silently degraded
// to fallback mode.
function resolvePromptInput() {
  const specific = document.querySelector(config.promptInput)
  if (specific) return { el: specific, via: 'specific' }
  const generic = findGenericPromptInput()
  return generic ? { el: generic, via: 'generic' } : { el: null, via: null }
}

// For event-driven checks (a keydown or input event already has a target
// element in hand) — el counts as the prompt input if it matches the
// specific selector, OR if the specific selector matches NOTHING anywhere
// on the page right now (i.e. it looks broken) AND el itself looks like a
// generic text input. Tying fallback activation to "the specific selector
// is definitely absent" — not just "doesn't match this one element" —
// keeps precision on sites where the selector still works fine and the
// user is legitimately typing into some other, correctly-excluded field.
function matchesPromptInput(el) {
  if (!el) return false
  if (el.matches?.(config.promptInput)) return true
  if (document.querySelector(config.promptInput)) return false
  return isGenericTextInput(el)
}

const config = resolveConfig(window.location.hostname)
if (!config) {
  // Unsupported host — manifest host_permissions shouldn't allow this, but bail safely.
  warn('no site config for', window.location.hostname, '— content script loaded but inert')
} else {
  log(`loaded for ${config.tool} — watching for prompt submit on "${config.promptInput}", response on "${config.responseContainer}"`)
  // Fires once at load so you can immediately confirm the selectors resolve
  // to something real, before you've even sent a message.
  const inputProbe = document.querySelector(config.promptInput)
  log(inputProbe ? `promptInput selector FOUND an element:` : `promptInput selector found NOTHING yet (may render after page finishes loading)`, inputProbe || '')

  // Remote override — background.js fetches /api/site-configs on startup
  // and on a periodic alarm, caching the result. `config` is a single
  // shared object (the same one DEFAULT_SITE_CONFIGS holds), and every
  // later function reads config.promptInput etc. at call time rather than
  // capturing a copy — so mutating its fields in place here is picked up
  // everywhere else automatically, no bigger async refactor needed.
  browser.storage.local.get('castmir_remote_site_configs').then(({ castmir_remote_site_configs }) => {
    const remote = castmir_remote_site_configs?.[window.location.hostname]
    if (!remote) return
    Object.assign(config, remote)
    log('applied remote site config override for', window.location.hostname, config)
  }).catch(() => {}) // bundled defaults above are already a safe fallback

  // Health signal — an immediate check (right above) routinely finds
  // nothing on SPA sites that render their composer asynchronously, so
  // it's not a meaningful "this is broken" signal on its own. Checking
  // again once the page has had time to settle, and reporting that result
  // back, lets a real DOM change (the site's own update, not just normal
  // async rendering) surface automatically instead of waiting for someone
  // to notice and report it — see /api/admin/selector-health.
  setTimeout(() => {
    const { el, via } = resolvePromptInput()
    if (!el) warn(`promptInput selector "${config.promptInput}" still found nothing after the page settled, and no generic fallback candidate either — this site's DOM may have changed`)
    else if (via === 'generic') warn(`specific selector "${config.promptInput}" found nothing, but a generic fallback candidate is covering it — capture still works, but the selector itself needs fixing`)
    browser.runtime.sendMessage({
      type: 'CASTmir_SELECTOR_HEALTH',
      hostname: window.location.hostname,
      tool: config.tool,
      prompt_input_found: !!el,
      via,
    }).catch(() => {})
  }, 4000)
}

// ── Structural signals — still computed even though raw text is also sent
// now, so scoring stays cheap on the backend and doesn't require re-parsing
// text for the common case. ─────────────────────────────────────────────
function deriveSignals(promptText) {
  const words = promptText.trim().split(/\s+/).filter(Boolean)
  return {
    word_count: words.length,
    prompt_chars: promptText.length,
    has_role: /\b(you are|act as|as an?)\b/i.test(promptText),
    has_format: /\b(format|bullet|list|table|step|json|markdown)\b/i.test(promptText),
    has_constraint: /\b(must|should|don'?t|avoid|only|limit|maximum|minimum)\b/i.test(promptText),
    has_example: /\b(example|for instance|such as)\b/i.test(promptText),
  }
}

// ── Session/turn bookkeeping (persisted per-tab in browser.storage.session) ─
let sessionId = null
let turnNumber = 0
let pendingPromptTimestamp = null
let pendingSignals = null
let pendingPromptText = null
let pendingResponseBaselineCount = 0 // how many responseContainer matches existed BEFORE this turn's prompt — a mutation only counts as "the response" once matches exceed this, otherwise it's just re-detecting an older, already-finished response still sitting in the DOM
let responseDebounceTimer = null
let lastCapturedText = null
let lastCaptureAt = 0

async function ensureSession() {
  if (sessionId) return sessionId
  const stored = await browser.storage.session.get('castmir_session_id')
  sessionId = stored.castmir_session_id || crypto.randomUUID()
  await browser.storage.session.set({ castmir_session_id: sessionId })
  return sessionId
}

async function onPromptSubmit(trigger) {
  hideCoachWidget() // the prompt is being sent as-is now, any pending nudge is stale
  reportQualityStatus(0) // clear the toolbar badge too — it's no longer sitting unsent
  const { el: input, via } = resolvePromptInput()
  if (!input) {
    warn(`prompt submit triggered (via ${trigger}) but promptInput selector "${config.promptInput}" found nothing, and no generic fallback candidate either — can't capture this turn`)
    return
  }
  if (via === 'generic') log(`captured via generic fallback — specific selector "${config.promptInput}" found nothing on this page`)
  // .value first: a real <textarea>/<input> always has .innerText === '' (an
  // empty string, not null/undefined), so `??` never falls through to
  // .value for those elements — this silently read empty text every time on
  // any textarea-based composer (ChatGPT's, Perplexity's). Contenteditable
  // divs (Gemini, Claude) have no .value property at all, so this still
  // falls through to .innerText correctly for those.
  const text = input.value ?? input.innerText ?? ''
  if (!text.trim()) {
    log(`prompt submit triggered (via ${trigger}) but captured text was empty — ignoring`)
    return
  }

  // Enter-to-send and click-to-send aren't mutually exclusive: sites often
  // wire the Enter key to internally trigger the same button click our click
  // listener also sees, firing this twice for one real message. Collapse
  // same-text captures that land within a second of each other.
  const now = Date.now()
  if (text === lastCapturedText && now - lastCaptureAt < 1000) {
    log(`prompt submit triggered (via ${trigger}) but identical text was just captured ${now - lastCaptureAt}ms ago via another trigger — ignoring duplicate`)
    return
  }
  lastCapturedText = text
  lastCaptureAt = now

  await ensureSession()
  turnNumber += 1
  pendingPromptTimestamp = now
  pendingSignals = deriveSignals(text)
  pendingPromptText = text
  pendingResponseBaselineCount = document.querySelectorAll(config.responseContainer).length
  log(`prompt captured (via ${trigger}), turn ${turnNumber}, ${text.length} chars — waiting for response... (baseline response count: ${pendingResponseBaselineCount})`)
}

// :last-of-type only looks at siblings under the same parent — it does NOT
// mean "the most recently added matching element on the page." Each response
// container sits at a different nesting depth per turn, so that pseudo-class
// silently matched the wrong (or no) element. Grab every match and take the
// last one in document order instead.
function lastMatch(selector) {
  const all = document.querySelectorAll(selector)
  return all.length ? all[all.length - 1] : null
}

function finalizeResponse(responseText) {
  const outputChars = responseText.length
  const promptTimestamp = pendingPromptTimestamp
  const now = Date.now()
  log(`response captured, ${outputChars} chars, latency ${now - promptTimestamp}ms — sending to backend`)
  browser.runtime.sendMessage({
    type: 'CASTmir_SESSION_EVENT',
    payload: {
      session_id: sessionId,
      tool: config.tool,
      timestamp_prompt: new Date(promptTimestamp).toISOString(),
      timestamp_response: new Date(now).toISOString(),
      latency_ms: now - promptTimestamp,
      turn_number: turnNumber,
      output_chars: outputChars,
      prompt_text: pendingPromptText,
      response_text: responseText,
      ...pendingSignals,
    },
  }).then(res => {
    if (res?.ok) log('backend accepted the event:', res.data)
    else warn('backend rejected or errored on the event:', res)
  }).catch(err => warn('sendMessage to background.js failed:', err))

  pendingPromptTimestamp = null
  pendingSignals = null
  pendingPromptText = null
}

function watchForResponse() {
  const observer = new MutationObserver(() => {
    if (!pendingPromptTimestamp) return // no prompt pending, nothing to match against

    const allMatches = document.querySelectorAll(config.responseContainer)
    // A mutation firing doesn't mean OUR response arrived — it could be any
    // DOM change at all (the user's own message bubble rendering, a UI state
    // toggle, etc). Only proceed once a genuinely NEW container exists beyond
    // whatever was already there when the prompt was sent — otherwise we'd
    // re-grab a previous turn's already-finished response as if it were new.
    if (allMatches.length <= pendingResponseBaselineCount) return

    // The newest match in DOM order isn't always the real response — Copilot
    // taught us this the hard way: it wraps a trailing "Edit in a page"
    // action link (and empty citation-button internals) in the same class
    // family as the actual content, all rendered after it, so a naive "take
    // the last one" grabbed a 14-character button label instead of the
    // reply. Scan backward for the last match with enough text to plausibly
    // BE a real response, skipping short trailing UI fragments.
    const MIN_RESPONSE_CHARS = 15
    let responseEl = null
    for (let i = allMatches.length - 1; i >= pendingResponseBaselineCount; i--) {
      const candidateText = allMatches[i].innerText || ''
      if (candidateText.trim().length >= MIN_RESPONSE_CHARS) { responseEl = allMatches[i]; break }
    }
    if (!responseEl) return // nothing substantial yet — still streaming, or it really was just a short UI element

    const responseText = responseEl.innerText || ''

    // Responses stream in token by token, so the first non-empty text is
    // usually a partial chunk, not the finished answer. Debounce: only
    // finalize once the text has stopped changing for a bit.
    clearTimeout(responseDebounceTimer)
    responseDebounceTimer = setTimeout(() => finalizeResponse(responseText), 1200)
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  log(`MutationObserver watching document.body for responseContainer "${config.responseContainer}"`)
}

function attachSubmitListeners() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (matchesPromptInput(document.activeElement)) onPromptSubmit('Enter key')
  }, true)

  document.addEventListener('click', (e) => {
    if (e.target.closest(config.submitButton)) onPromptSubmit('send button click')
  }, true)
}

// ── Inline COACH — a Grammarly-style nudge instead of requiring the user to
// paste their prompt into a separate website modal. Detection is entirely
// local/free (ported from the backend's compute_pmi_from_text — see
// backend-py/agents/monitor.py, kept in sync manually); the actual Bedrock
// rewrite only fires when the user clicks the nudge, not on every keystroke,
// so typing normally never triggers an API call or any cost.
const COACH_MIN_CHARS = 40          // below this, it's almost certainly a short reply/clarification, not a standalone prompt worth nudging on
const COACH_WEAK_PMI_THRESHOLD = 2  // local PMI (1-5) at or below this triggers a nudge
const COACH_DEBOUNCE_MS = 1000      // wait for a pause in typing before evaluating
const COACH_RENUDGE_COOLDOWN_MS = 20000 // don't re-nudge the exact same text sooner than this

function computePmiLocal(text) {
  if (!text) return 1
  const words = text.trim().split(/\s+/).filter(Boolean)
  const hasRole = /\b(you are|act as|as an?)\b/i.test(text)
  const hasFormat = /\b(format|bullet|list|table|step|json|markdown)\b/i.test(text)
  const hasConstraint = /\b(must|should|don'?t|avoid|only|limit|maximum|minimum)\b/i.test(text)
  const hasContext = text.length > 200
  const hasExample = /\b(example|for instance|such as)\b/i.test(text)

  let score = 1
  if (words.length > 15) score += 1
  if (hasContext) score += 1
  if (hasFormat || hasConstraint) score += 1
  if (hasRole && hasExample) score += 1
  return Math.min(score, 5)
}

// How many distinct quality dimensions this prompt is missing — drives the
// small count badge on the coach icon (same signals computePmiLocal uses,
// broken out individually instead of collapsed into one 1-5 score).
function countMissingDimensions(text) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const hasRole = /\b(you are|act as|as an?)\b/i.test(text)
  const hasFormatOrConstraint = /\b(format|bullet|list|table|step|json|markdown|must|should|don'?t|avoid|only|limit|maximum|minimum)\b/i.test(text)
  const hasContext = text.length > 200
  const hasExample = /\b(example|for instance|such as)\b/i.test(text)
  const hasLength = words.length > 15
  return [hasRole, hasFormatOrConstraint, hasContext, hasExample, hasLength].filter(v => !v).length
}

function getInputText(input) {
  return input.value ?? input.innerText ?? ''
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str ?? ''
  return div.innerHTML
}

let coachDebounceTimer = null
let coachLastNudgedText = null
let coachLastNudgedAt = 0
let coachDismissedTexts = new Set()
let coachIconHost = null
let coachIconShadow = null
let coachCardHost = null
let coachCardShadow = null
let coachActiveInput = null
let coachActiveText = null

const COACH_ICON_URL = browser.runtime.getURL('icons/mascot-head.png')

function ensureCoachIcon() {
  if (coachIconHost) return coachIconShadow
  coachIconHost = document.createElement('div')
  coachIconHost.id = 'castmir-coach-icon-host'
  coachIconHost.style.cssText = 'position:fixed; z-index:2147483647; display:none;'
  document.documentElement.appendChild(coachIconHost)
  // Shadow DOM keeps CASTmir's styles from leaking into the host page and
  // vice versa — the same isolation technique real inline-suggestion tools
  // (Grammarly included) rely on for content-script-injected UI.
  coachIconShadow = coachIconHost.attachShadow({ mode: 'open' })
  coachIconShadow.innerHTML = `
    <style>
      :host { all: initial; }
      /* Anchored via the host's CSS "right" (see positionCoachIcon) so
         growing wider on hover extends this LEFT, into the input, rather
         than off the right edge of the screen.
         Two nested elements on purpose: overflow:hidden has to live on
         .icon-wrap to clip the width transition cleanly, but that same
         overflow:hidden was also clipping the badge — it's positioned with
         negative offsets so it visually pokes outside the circle, which is
         exactly what overflow:hidden cuts off. Badge is now a sibling of
         .icon-wrap (inside .icon-outer, which has no overflow rule) instead
         of a child of it. */
      .icon-outer { position: relative; height: 34px; }
      .icon-wrap {
        height: 34px; width: 34px; border-radius: 17px;
        background: #fff; cursor: pointer; box-sizing: border-box;
        border: 2px solid #782F40; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex; align-items: center; overflow: hidden;
        transition: width 0.16s ease;
      }
      .icon-outer:hover .icon-wrap { width: 176px; }
      .icon-img { width: 26px; height: 26px; min-width: 26px; margin: 0 4px; object-fit: contain; border-radius: 50%; pointer-events: none; }
      .label {
        font-size: 11px; font-weight: 700; color: #782F40; white-space: nowrap;
        opacity: 0; transition: opacity 0.12s ease; pointer-events: none;
        font-family: system-ui, -apple-system, sans-serif; padding-right: 10px;
      }
      .icon-outer:hover .label { opacity: 1; }
      .badge {
        position: absolute; top: -5px; right: -5px; min-width: 16px; height: 16px;
        border-radius: 8px; background: #C0392B; color: #fff; font-size: 10px; font-weight: 700;
        display: flex; align-items: center; justify-content: center; padding: 0 3px;
        font-family: system-ui, -apple-system, sans-serif; box-shadow: 0 0 0 2px #fff;
        pointer-events: none; z-index: 1;
      }
      .icon-outer:hover .badge { display: none; }
    </style>
    <div class="icon-outer" id="icon-wrap" title="CASTmir has a suggestion for this prompt">
      <div class="icon-wrap">
        <img class="icon-img" src="${COACH_ICON_URL}" alt="CASTmir" />
        <span class="label">CASTmir Prompt Coach</span>
      </div>
      <span class="badge" id="badge">!</span>
    </div>
  `
  coachIconShadow.getElementById('icon-wrap').addEventListener('click', onCoachIconClick)
  return coachIconShadow
}

function ensureCoachCard() {
  if (coachCardHost) return coachCardShadow
  coachCardHost = document.createElement('div')
  coachCardHost.id = 'castmir-coach-card-host'
  coachCardHost.style.cssText = 'position:fixed; z-index:2147483647; display:none;'
  document.documentElement.appendChild(coachCardHost)
  coachCardShadow = coachCardHost.attachShadow({ mode: 'open' })
  coachCardShadow.innerHTML = `
    <style>
      :host { all: initial; }
      .card {
        font-family: system-ui, -apple-system, sans-serif;
        background: #fff; color: #1C1C1C; border-radius: 12px;
        box-shadow: 0 6px 28px rgba(0,0,0,0.35); border: 1px solid rgba(0,0,0,0.08);
        box-sizing: border-box; display: flex; flex-direction: column;
        width: min(440px, calc(100vw - 32px));
        max-height: min(70vh, 560px);
        opacity: 0; transform: translateY(4px) scale(0.98);
        transition: opacity 0.14s ease, transform 0.14s ease;
      }
      .card.open { opacity: 1; transform: translateY(0) scale(1); }
      .head {
        font-weight: 700; font-size: 12px; color: #782F40; padding: 14px 16px 8px;
        display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
      }
      .close { cursor: pointer; color: #888; font-size: 18px; line-height: 1; padding: 2px 4px; }
      .scroll { overflow-y: auto; padding: 0 16px; flex: 1 1 auto; min-height: 0; }
      .body { font-size: 12px; line-height: 1.6; color: #333; }
      .rewritten {
        background: #F3ECE0; border-radius: 8px; padding: 10px 12px; margin: 4px 0 10px;
        font-size: 13px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; color: #1C1C1C;
      }
      .improvements { margin: 8px 0; padding-left: 16px; font-size: 11px; color: #555; }
      .pmi-row { font-size: 11px; color: #666; margin: 10px 0 4px; }
      .actions { display: flex; gap: 8px; padding: 12px 16px 4px; flex-shrink: 0; }
      button { flex: 1; border: none; border-radius: 7px; padding: 9px 6px; font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit; }
      .accept { background: #1E6B3C; color: #fff; }
      .rephrase { background: #F3ECE0; color: #782F40; }
      .dismiss { background: #eee; color: #333; }
      .loading { text-align: center; padding: 24px 16px; color: #888; font-size: 12px; }
      .dash-link {
        display: block; text-align: center; padding: 8px 16px 14px; flex-shrink: 0;
        font-size: 11px; color: #782F40; font-weight: 600; cursor: pointer; text-decoration: underline;
      }
    </style>
    <div class="card" id="card"></div>
  `
  return coachCardShadow
}

function positionCoachIcon() {
  if (!coachIconHost || !coachActiveInput) return
  const rect = coachActiveInput.getBoundingClientRect()
  const size = 34
  const margin = 8
  // Top-right corner of the input, not bottom-right — the bottom-right
  // corner is exactly where a site's own send button conventionally sits
  // (and where Grammarly's floating icon docks too, per the same
  // convention this was originally modeled on), so anchoring there landed
  // directly on top of either one depending on the site. Top-right avoids
  // both: send buttons are essentially never up there.
  // Anchored via "right" (not "left") so that when the icon expands into
  // the hover label, it grows further LEFT into the input rather than
  // pushing its right edge off the viewport — the anchor point itself
  // never moves.
  let right = window.innerWidth - rect.right + margin
  let top = rect.top + margin
  right = Math.min(Math.max(right, margin), window.innerWidth - size - margin)
  top = Math.min(Math.max(top, margin), window.innerHeight - size - margin)
  coachIconHost.style.left = 'auto'
  coachIconHost.style.right = `${Math.round(right)}px`
  coachIconHost.style.top = `${Math.round(top)}px`
}

// Positions the card AFTER its content is rendered (height varies with
// content), clamping fully inside the viewport — this is the actual fix for
// "the suggestion doesn't show fully and I can't reach the accept button":
// the old version anchored to the input's top-left with no viewport check
// at all, so on a input near the edge of the screen the card (and its
// buttons) could render partly or entirely off-screen with no way to reach
// them.
function positionCoachCard() {
  if (!coachCardHost || !coachIconHost) return
  const iconRect = coachIconHost.getBoundingClientRect()
  const card = coachCardShadow.getElementById('card')
  const margin = 8
  const vw = window.innerWidth, vh = window.innerHeight
  const cardW = card.offsetWidth
  const cardH = card.offsetHeight

  let left = iconRect.right - cardW // right-align to the icon by default
  let top = iconRect.top - cardH - margin // prefer opening upward, like Grammarly's popover
  if (top < margin) top = iconRect.bottom + margin // not enough room above — flip below
  if (left < margin) left = margin
  if (left + cardW > vw - margin) left = vw - cardW - margin
  if (top + cardH > vh - margin) top = Math.max(margin, vh - cardH - margin)

  coachCardHost.style.left = `${Math.round(left)}px`
  coachCardHost.style.top = `${Math.round(top)}px`
}

function showCoachIcon(input, text) {
  coachActiveInput = input
  coachActiveText = text
  const shadow = ensureCoachIcon()
  const missing = countMissingDimensions(text)
  shadow.getElementById('badge').textContent = missing > 0 ? String(missing) : '!'
  coachIconHost.style.display = 'block'
  positionCoachIcon()
}

function hideCoachWidget() {
  if (coachIconHost) coachIconHost.style.display = 'none'
  if (coachCardHost) coachCardHost.style.display = 'none'
  // Reset the fade-in state so the next open re-triggers the transition
  // instead of starting already-visible (opacity would otherwise still be
  // 1 from last time, only display:none is what's actually hiding it).
  coachCardShadow?.getElementById('card')?.classList.remove('open')
}

window.addEventListener('scroll', () => {
  if (coachIconHost?.style.display !== 'none') positionCoachIcon()
  if (coachCardHost?.style.display !== 'none') positionCoachCard()
}, true)
window.addEventListener('resize', () => {
  if (coachIconHost?.style.display !== 'none') positionCoachIcon()
  if (coachCardHost?.style.display !== 'none') positionCoachCard()
})

// Escape-to-close and click-away-to-dismiss — standard behavior for any
// popover-style overlay (Grammarly's suggestion card included), missing
// here before now. e.target inside a Shadow DOM click gets retargeted to
// the shadow HOST by the time a listener outside the shadow tree (this
// one, on document) sees it — so .contains(e.target) still correctly
// recognizes "the click landed somewhere inside this widget" even for
// clicks on elements deep inside the card's shadow root.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (coachCardHost?.style.display !== 'none' || coachIconHost?.style.display !== 'none') hideCoachWidget()
}, true)

document.addEventListener('click', (e) => {
  if (coachCardHost?.style.display === 'none' || !coachCardHost) return
  if (coachCardHost.contains(e.target) || coachIconHost?.contains(e.target)) return
  hideCoachWidget()
}, true)

async function onCoachIconClick() {
  const shadow = ensureCoachCard()
  const card = shadow.getElementById('card')
  coachCardHost.style.display = 'block'
  card.innerHTML = '<div class="loading">CASTmir is thinking…</div>'
  positionCoachCard()
  // Two frames, not one: display just flipped from none to block this
  // same tick, so the browser hasn't painted the pre-transition (opacity:0)
  // state yet — adding .open before that paint happens collapses the
  // fade/scale into a single instantaneous jump instead of an animation.
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('open')))
  await runCoachRewrite(shadow, card)
}

async function runCoachRewrite(shadow, card) {
  card.innerHTML = '<div class="loading">CASTmir is thinking…</div>'
  positionCoachCard()
  log('COACH requesting rewrite for', coachActiveText.length, 'chars')

  // COACH can be triggered while the user is still typing their first
  // message in a tab, before onPromptSubmit has ever run ensureSession() —
  // call it here too so the backend gets a real session id to scope
  // "same conversation" context by, instead of null (which would fall back
  // to only cross-conversation history for what may actually already be an
  // ongoing thread on reload).
  const currentSessionId = await ensureSession()

  const result = await browser.runtime.sendMessage({
    type: 'CASTmir_COACH_REWRITE',
    prompt: coachActiveText,
    tool: config.tool,
    session_id: currentSessionId,
  }).catch(err => ({ ok: false, error: String(err) }))

  if (!result?.ok) {
    warn('COACH rewrite failed:', result?.error)
    card.innerHTML = `
      <div class="head"><span>CASTmir</span><span class="close" id="close">×</span></div>
      <div class="scroll"><div class="body">Couldn't get a suggestion right now — try again in a moment.</div></div>
      <div class="actions"><button class="dismiss" id="close-err">Close</button></div>
    `
    shadow.getElementById('close').addEventListener('click', hideCoachWidget)
    shadow.getElementById('close-err').addEventListener('click', hideCoachWidget)
    positionCoachCard()
    return
  }

  const r = result.data
  browser.runtime.sendMessage({
    type: 'CASTmir_LOG_INTERVENTION',
    payload: {
      session_id: currentSessionId,
      type: 'rewrite',
      original_prompt_chars: coachActiveText.length,
      pmi_before: r.pmi_before,
      pmi_after: r.pmi_after,
      recommendation: r.explanation,
    },
  }).catch(() => {})
  card.innerHTML = `
    <div class="head"><span>✓ Suggested rewrite</span><span class="close" id="close">×</span></div>
    <div class="scroll">
      <div class="rewritten">${escapeHtml(r.rewritten_prompt)}</div>
      <div class="body">${escapeHtml(r.explanation || '')}</div>
      ${r.key_improvements?.length ? `<ul class="improvements">${r.key_improvements.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : ''}
      <div class="pmi-row">PMI: ${r.pmi_before ?? '?'}/5 → ${r.pmi_after ?? '?'}/5</div>
    </div>
    <div class="actions">
      <button class="accept" id="accept">Accept</button>
      <button class="rephrase" id="rephrase">Try another</button>
      <button class="dismiss" id="dismiss">Dismiss</button>
    </div>
    <span class="dash-link" id="view-dashboard">View my dashboard →</span>
  `
  positionCoachCard()

  shadow.getElementById('close').addEventListener('click', hideCoachWidget)
  shadow.getElementById('dismiss').addEventListener('click', () => {
    coachDismissedTexts.add(coachActiveText)
    hideCoachWidget()
  })
  shadow.getElementById('rephrase').addEventListener('click', () => {
    runCoachRewrite(shadow, card)
  })
  shadow.getElementById('view-dashboard').addEventListener('click', () => {
    browser.runtime.sendMessage({ type: 'CASTmir_OPEN_DASHBOARD' })
  })
  shadow.getElementById('accept').addEventListener('click', async () => {
    const applied = replaceInputText(coachActiveInput, r.rewritten_prompt)
    if (applied) {
      log('COACH suggestion applied directly into the composer')
      hideCoachWidget()
      return
    }
    // Some rich-text editors don't honor programmatic insertion at all —
    // fall back to clipboard rather than silently doing nothing.
    try {
      await navigator.clipboard.writeText(r.rewritten_prompt)
      card.innerHTML = `
        <div class="head"><span>CASTmir</span><span class="close" id="close2a">×</span></div>
        <div class="scroll"><div class="body">Couldn't auto-fill this editor — copied the suggestion to your clipboard instead. Paste it in with Ctrl+V.</div></div>
        <div class="actions"><button class="dismiss" id="close2b">Close</button></div>
      `
      shadow.getElementById('close2a').addEventListener('click', hideCoachWidget)
      shadow.getElementById('close2b').addEventListener('click', hideCoachWidget)
      positionCoachCard()
    } catch {
      hideCoachWidget()
    }
  })
}

function replaceInputText(input, newText) {
  input.focus()
  const isFormElement = input.tagName === 'TEXTAREA' || input.tagName === 'INPUT'
  if (isFormElement) {
    input.select()
    let ok = false
    try { ok = document.execCommand('insertText', false, newText) } catch { ok = false }
    if (!ok) {
      // Fallback: the native property setter, bypassing any override the
      // framework installed on the instance — then fire the input event
      // by hand so anything listening for value changes still notices.
      const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
      setter.call(input, newText)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    return true
  }

  // contenteditable rich editors (Gemini's Quill, Claude's ProseMirror):
  // select the element's full contents, then use execCommand so the page's
  // own framework sees this as real typed input via native
  // beforeinput/input events, rather than a raw DOM mutation it might
  // silently ignore or revert on its next render pass.
  try {
    const range = document.createRange()
    range.selectNodeContents(input)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    const ok = document.execCommand('insertText', false, newText)
    return !!ok
  } catch (err) {
    warn('replaceInputText via execCommand threw for a contenteditable target', err)
    return false
  }
}

function attachCoachListener() {
  document.addEventListener('input', (e) => {
    if (!matchesPromptInput(e.target)) return
    hideCoachWidget()
    const input = e.target
    clearTimeout(coachDebounceTimer)
    coachDebounceTimer = setTimeout(() => evaluateForCoachNudge(input), COACH_DEBOUNCE_MS)
  }, true)
}

// Same weak-prompt condition that drives the inline widget, also reported
// to background.js so the toolbar badge stays in sync — a signal visible
// even when the user isn't currently looking at the input box or tab.
function reportQualityStatus(missing) {
  browser.runtime.sendMessage({ type: 'CASTmir_PROMPT_QUALITY_STATUS', missing }).catch(() => {})
}

function evaluateForCoachNudge(input) {
  const text = getInputText(input)
  if (!text || text.trim().length < COACH_MIN_CHARS) {
    reportQualityStatus(0)
    return
  }

  const pmi = computePmiLocal(text)
  const isWeak = pmi <= COACH_WEAK_PMI_THRESHOLD
  reportQualityStatus(isWeak ? countMissingDimensions(text) : 0)
  if (!isWeak) return

  const now = Date.now()
  if (text === coachLastNudgedText) {
    if (coachDismissedTexts.has(text)) return
    if (now - coachLastNudgedAt < COACH_RENUDGE_COOLDOWN_MS) return
  }

  coachLastNudgedText = text
  coachLastNudgedAt = now
  showCoachIcon(input, text)
}

if (config) {
  attachSubmitListeners()
  watchForResponse()
  attachCoachListener()
}
