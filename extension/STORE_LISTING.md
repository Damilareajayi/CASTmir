# Chrome Web Store submission — copy-paste reference

Everything here is ready to paste into the Developer Dashboard form fields.
The only things I can't produce: actual in-browser screenshots (need a real
Chrome session — see "Screenshots" below), and anything requiring your
Google Developer account itself.

## Store listing

**Name** (45 char max)
```
CASTmir — AI performance and Security Monitor
```

**Summary** (132 char max — shown in search results)
```
Scores your AI prompts, tracks your improvement, and flags security risks like prompt injection — with your consent.
```

**Category**: Productivity

**Language**: English (United States)

**Detailed description**
```
CASTmir is a research pilot from the RECAST Team at the FSU Innovation Hub,
funded by the ReliaQuest Innovation Challenge Fund. It monitors your AI tool
usage — ChatGPT, Claude, Gemini, Copilot, and Perplexity — to help you write
better prompts and catch security risks in real time.

WHAT IT DOES
• Scores every prompt on a 1-5 Prompt Maturity Index (PMI), grounded in
  Self-Directed Learning research
• Tracks your quality trend over time on a private dashboard only you can see
• Flags security-risk patterns — prompt injection, MCP manipulation, RAG
  poisoning, data exfiltration attempts — with an immediate in-browser warning
• Offers AI-powered coaching to rewrite weak prompts, on request

YOUR CONTROL
• Nothing is captured on any site until you explicitly approve that site
• Approval is per-site, not all-or-nothing — turn it on only where you want it
• A clear consent screen explains exactly what's collected before anything
  is captured
• Remove the extension any time to stop all data collection immediately

WHO THIS IS FOR
This is a pilot for an FSU research cohort. You'll choose a RECAST team
alias during setup so the research team can recognize your activity.

Full privacy policy: https://5vpmkv6yjy.us-east-1.awsapprunner.com/#privacy
```

## Privacy practices tab (required — this is the part Google reviews closely)

**Single purpose description**
```
CASTmir monitors a user's interactions with AI chat tools (prompts and
responses) to score prompt quality, track improvement over time, and detect
security-risk behavioral patterns, displayed on a private user dashboard.
```

**Permission justifications** (one per requested permission)

| Permission | Justification |
|---|---|
| `storage` | Stores the user's anonymized ID and consent state locally, and buffers session data between the content script and background service worker. |
| `tabs` | Reads the active tab's URL to determine whether it's a supported AI site and to show the correct per-tab toolbar icon state. |
| `scripting` | Dynamically injects the content script only into sites the user has explicitly authorized — no site is monitored without this per-site approval. |
| `alarms` | Reserved for periodic housekeeping (e.g. session cleanup); not used for tracking. |
| `notifications` | Shows an immediate in-browser warning when a security risk is detected in a session. |
| Host permissions (chatgpt.com, claude.ai, gemini.google.com, copilot.microsoft.com, perplexity.ai) | Requested at runtime, per site, only after the user clicks "Authorize" — never granted at install. Needed to read prompt/response content and structural signals on the specific AI tool the user approves. |

**Data usage disclosure** (check these boxes in the dashboard form)
- ☑ Personally identifiable information — *No* (only an anonymized, locally-generated ID; no name/email/account collected)
- ☑ User activity — *Yes* (prompts and AI responses on approved sites)
- ☑ Website content — *Yes* (same as above)

**"I do not sell or transfer user data to third parties..." certification**: Yes, this is accurate — say so.

**Privacy policy URL** (required once you declare user activity/content collection)
```
https://5vpmkv6yjy.us-east-1.awsapprunner.com/#privacy
```

## Icons

Already built, in `extension/icons/`:
- `icon-128.png` — use for the 128×128 store icon requirement.

## Screenshots (you'll need to capture these yourself)

Google requires at least 1 (up to 5), either 1280×800 or 640×400, no alpha
channel. I don't have a working browser session in this environment to
produce real ones. Good candidates once you have a moment:
1. The popup's consent screen (shows the data-use disclosure clearly —
   good for reviewer trust too)
2. The popup once monitoring is active (KPIs + status dot)
3. The full user dashboard (quality/PMI trend charts)
4. A security alert notification

## Before you submit

1. Create/sign in to a Google Developer account at the [Chrome Web Store
   Developer Dashboard](https://chrome.google.com/webstore/devconsole) —
   one-time $5 registration fee.
2. Package the extension: zip the `extension/` folder contents (same file
   already at `frontend/public/castmir-extension.zip` works, or re-zip
   fresh — either way, exclude `INSTALL.md` and `STORE_LISTING.md`, they're
   not part of the runtime extension).
3. Upload, fill in the fields above, attach icon + screenshots, submit for
   review.
