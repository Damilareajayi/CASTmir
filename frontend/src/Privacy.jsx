import { C, TOOLS } from './constants.js'
import { CastmirBar, useIsMobile } from './components/UI.jsx'

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: C.dark, marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: 13, color: C.gray, lineHeight: 1.75 }}>{children}</div>
    </div>
  )
}

export default function Privacy({ onBack }) {
  const isMobile = useIsMobile()
  return (
    <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif', background: C.bg, minHeight: '100vh' }}>
      <CastmirBar h={4} onClick={onBack} />
      <div style={{ padding: isMobile ? '24px 6%' : '40px 8%', maxWidth: 760, margin: '0 auto' }}>
        <div onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: onBack ? 'pointer' : 'default', marginBottom: 28 }}>
          <img src="/mascot-head.png" alt="CASTmir" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          <div style={{ fontWeight: 800, fontSize: 16, color: C.garnet, letterSpacing: 2 }}>CASTmir</div>
        </div>

        <h1 style={{ fontSize: 'clamp(22px,3vw,30px)', fontWeight: 800, color: C.dark, marginBottom: 6 }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 32 }}>Last updated August 27, 2026</p>

        <Section title="What CASTmir is">
          CASTmir is a browser extension developed by the RECAST Team at the FSU Innovation Hub,
          funded by the ReliaQuest Innovation Challenge Fund. It monitors your usage of AI tools
          ({TOOLS.join(', ')}) to score prompt quality, track your improvement over time, and flag
          security risks like prompt injection in real time.
        </Section>

        <Section title="What we collect">
          Once you approve CASTmir on a specific site and complete the consent step, CASTmir
          captures: (1) the text of your prompts and the AI's responses on that site, (2) timing
          and length metadata (response latency, character/word counts), and (3) structural
          signals derived from your prompts (e.g. whether it included an example or format
          instructions). Nothing is captured on any site until you've explicitly approved that
          site and completed the consent screen — there is no default or background collection.
        </Section>

        <Section title="What it's used for">
          Your data is used to: score your prompt quality and Prompt Maturity Index (PMI); detect
          when an AI tool's output quality has drifted from your baseline; run a security
          classifier that flags behavioral patterns consistent with prompt injection, MCP
          manipulation, RAG poisoning, or data exfiltration attempts; and generate in-context
          coaching suggestions to help you write more effective prompts. Prompt/response content
          is also used to improve the accuracy of CASTmir's scoring models over time.
        </Section>

        <Section title="Who can see it">
          Your prompts, responses, and personal usage data are visible only to you, through your
          private dashboard, identified by an anonymized ID generated on your device — not your
          name, email, or account on the AI tools you use. The research team can only see an
          aggregated, anonymized view (cohort-wide trends, security event summaries) that is never
          linked back to your individual identity or your individual prompts/responses.
        </Section>

        <Section title="What we don't do">
          We do not sell your data. We do not share individual prompts or responses with any
          third party, including the AI tool providers themselves, ReliaQuest, or FSU outside the
          research team operating this pilot. We do not use your data for advertising.
        </Section>

        <Section title="Your control">
          You choose which sites CASTmir is active on — approval is per-site, not all-or-nothing.
          You can remove the extension at any time via your browser's extensions page, which stops
          all data collection immediately. To request deletion of previously collected data,
          contact the RECAST Team through FSU Innovation Hub.
        </Section>

        <Section title="Contact">
          Questions about this policy or your data can be directed to the RECAST Team, FSU
          Innovation Hub.
        </Section>
      </div>
      <CastmirBar h={4} onClick={onBack} />
    </div>
  )
}
