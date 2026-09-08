import { C, TOOLS } from './constants.js'
import { CastmirBar, useIsMobile } from './components/UI.jsx'
import AgentStatus from './components/AgentStatus.jsx'

export default function Landing({ onEnterUser, onEnterAdmin }) {
  const isMobile = useIsMobile()

  return (
    <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif', background: C.bg }}>
      <CastmirBar h={4} />

      {/* Nav */}
      <div style={{ padding: '16px 5%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/mascot-head.png" alt="CASTmir" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: C.garnet, letterSpacing: 3 }}>CASTmir</div>
            <div style={{ fontSize: 8, color: C.gray, letterSpacing: 1 }}>AI PERFORMANCE &amp; SECURITY MONITOR</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="#install" style={{ background: C.garnet, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' }}>Install extension</a>
          <button onClick={onEnterUser} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, color: C.dark, cursor: 'pointer' }}>My dashboard</button>
          <button onClick={onEnterAdmin} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, color: C.dark, cursor: 'pointer' }}>Admin dashboard</button>
        </div>
      </div>

      {/* Hero */}
      <section style={{ padding: isMobile ? '40px 6%' : '60px 8%', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: 40 }}>
        <div style={{ flex: 1.2 }}>
          <div style={{ color: C.garnet, fontWeight: 700, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>
            RECAST Team · FSU Innovation Hub · ReliaQuest Innovation Challenge Fund
          </div>
          <h1 style={{ fontSize: 'clamp(28px,4.5vw,46px)', fontWeight: 800, color: C.dark, lineHeight: 1.15, marginBottom: 18 }}>
            Grammarly for AI interactions —<br /><span style={{ color: C.garnet }}>performance and security, together.</span>
          </h1>
          <p style={{ fontSize: 15, color: C.gray, lineHeight: 1.7, marginBottom: 28, maxWidth: 560 }}>
            A browser extension that sits inline as you use {TOOLS.join(', ')}, and any other AI tool — scoring
            prompt quality, detecting drift, and flagging security threats in real time. It captures your prompts
            and the AI's responses on sites you approve, to score them accurately — never silently, always with
            your explicit consent first.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="#install" style={{ background: C.garnet, color: '#fff', border: 'none', borderRadius: 10, padding: '14px 30px', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 24px rgba(120,47,64,0.25)', textDecoration: 'none', display: 'inline-block' }}>
              Install CASTmir →
            </a>
            <button onClick={onEnterUser} style={{ background: '#fff', color: C.dark, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 26px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              Already installed? View my dashboard
            </button>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <img src="/mascot-clean.png" alt="CASTmir mascot" style={{ maxWidth: isMobile ? '55vw' : 320, width: '100%', objectFit: 'contain', filter: 'drop-shadow(0 16px 32px rgba(0,0,0,0.15))' }} />
        </div>
      </section>

      {/* Install */}
      <section id="install" style={{ padding: isMobile ? '40px 6%' : '56px 8%', background: '#fff', scrollMarginTop: 20 }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ color: C.garnet, fontWeight: 700, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10, textAlign: 'center' }}>Get started</div>
          <h2 style={{ fontSize: 'clamp(20px,3vw,28px)', fontWeight: 800, color: C.dark, textAlign: 'center', marginBottom: 8 }}>
            Install CASTmir
          </h2>
          <p style={{ fontSize: 13, color: C.gray, textAlign: 'center', marginBottom: 28, lineHeight: 1.6 }}>
            Not in the Chrome Web Store yet — during the pilot it installs directly from this file.
            Works in Chrome, Edge, Brave, and other Chromium browsers. Takes about 2 minutes.
          </p>

          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <a href="/castmir-extension.zip" download style={{ background: C.garnet, color: '#fff', border: 'none', borderRadius: 10, padding: '14px 34px', fontSize: 14, fontWeight: 800, cursor: 'pointer', textDecoration: 'none', display: 'inline-block', boxShadow: '0 8px 24px rgba(120,47,64,0.25)' }}>
              ↓ Download castmir-extension.zip
            </a>
          </div>

          <ol style={{ margin: 0, padding: '0 0 0 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              ['Unzip the file', 'Right-click the downloaded zip → Extract All (Windows) or double-click it (Mac). Keep the resulting castmir-extension folder where it is.'],
              ['Open your browser\'s extensions page', 'Chrome: go to chrome://extensions. Edge: edge://extensions. Brave: brave://extensions.'],
              ['Turn on Developer mode', 'Toggle it on — usually top-right of the page. Three new buttons appear.'],
              ['Click "Load unpacked"', 'Select the castmir-extension folder (the folder itself, not a file inside it).'],
              ['Pin it to your toolbar', 'Click the puzzle-piece icon in your toolbar, find CASTmir, click the pin.'],
              ['Visit a supported AI site and authorize it', `Go to ${TOOLS.join(', ')}, click the CASTmir icon, approve site access, read the consent screen, enter your cohort code.`],
            ].map(([title, desc], i) => (
              <li key={i} style={{ fontSize: 13, color: C.dark, lineHeight: 1.6 }}>
                <strong>{title}.</strong> <span style={{ color: C.gray }}>{desc}</span>
              </li>
            ))}
          </ol>

          <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 24 }}>
            Your browser may warn that the extension isn't from the Chrome Web Store — expected during the pilot, safe to proceed.
          </p>
        </div>
      </section>

      {/* Principles */}
      <section style={{ padding: isMobile ? '32px 6%' : '40px 8%', background: C.bg }}>
        <div style={{ color: C.garnet, fontWeight: 700, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 18, textAlign: 'center' }}>Design principles</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 16, maxWidth: 960, margin: '0 auto' }}>
          {[
            ['🔍', 'Consent, not silence', 'Nothing is captured until you approve a site and read what CASTmir collects. That disclosure is on the consent screen, not buried in fine print.'],
            ['🛡️', 'OCSF-first security', 'Every security event is formatted for production SIEM ingestion from day one — immediately usable by ReliaQuest\'s platform.'],
            ['📊', 'Two dashboards, two scopes', 'Your personal dashboard is private, scoped to you alone. The research dashboard is anonymized and aggregate-only.'],
          ].map(([icon, title, desc], i) => (
            <div key={i} style={{ background: C.bg, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 22, marginBottom: 10 }}>{icon}</div>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.dark, marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Agents */}
      <section style={{ padding: isMobile ? '32px 6%' : '48px 8%' }}>
        <div style={{ color: C.garnet, fontWeight: 700, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 18, textAlign: 'center' }}>Four agents, running continuously</div>
        <AgentStatus />
      </section>

      {/* CTA */}
      <section style={{ padding: isMobile ? '48px 6%' : '64px 8%', background: `linear-gradient(135deg,${C.garnetD},${C.garnet})`, textAlign: 'center' }}>
        <img src="/mascot-cta.png" alt="CASTmir mascot" style={{ width: 100, marginBottom: 20, filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.25))' }} />
        <h2 style={{ fontSize: 'clamp(22px,3.5vw,32px)', fontWeight: 800, color: '#fff', marginBottom: 24 }}>
          Install the extension. Start monitoring in minutes.
        </h2>
        <a href="/castmir-extension.zip" download style={{ background: C.gold, color: C.garnetD, border: 'none', borderRadius: 10, padding: '14px 34px', fontSize: 14, fontWeight: 800, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }}>
          ↓ Download and install →
        </a>
      </section>

      {/* Footer */}
      <div style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/mascot-head.png" alt="CASTmir" style={{ width: 20, objectFit: 'contain' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: C.garnet, letterSpacing: 2 }}>CASTmir</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <a href="#privacy" style={{ fontSize: 10, color: C.muted, textDecoration: 'underline' }}>Privacy Policy</a>
          <span style={{ fontSize: 10, color: C.muted }}>RECAST Team · FSU Innovation Hub · ReliaQuest 2026</span>
        </div>
      </div>
      <CastmirBar h={4} />
    </div>
  )
}
