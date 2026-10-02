'use client'

import { useMarketing } from './MarketingShell'

export function HomeSections() {
  const { navigate } = useMarketing()

  return (
    <>
{/* PAIN */}
      <section className="pain">
        <div className="pain-inner">
          <div className="section-label mono reveal">The Reality</div>
          <h2 className="pain-headline serif reveal">
            You're doing the work<br />of <em>five people.</em>
          </h2>
          <div className="pain-grid">
            {[
              { num: "01", title: "You're the engineer, the marketer, the salesperson.", body: "Every solo founder wears every hat. The work is real. The bandwidth isn't. You drop things. Important things." },
              { num: "02", title: "AI tools help, but they don't remember, coordinate, or act.", body: "You've tried the chatbots. They're powerful for a prompt, then gone. Nothing carries context. Nothing talks to anything else." },
              { num: "03", title: "You can't hire yet. But you needed a team yesterday.", body: "You're pre-revenue or early-stage. A full team isn't an option. But operating alone at full speed isn't sustainable either." },
            ].map((p, i) => (
              <div key={p.num} className={`pain-card reveal delay-${i + 1}`}>
                <div className="pain-num mono">{p.num}</div>
                <div className="pain-title serif">{p.title}</div>
                <div className="pain-body">{p.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="features" id="features">
        <div className="features-inner">
          <div className="section-label mono reveal">The Product</div>
          <h2 className="features-headline serif reveal">
            Not a chatbot.<br />An <em>operating system.</em>
          </h2>

          {/* Feature 1: Constitution */}
          <div className="feature-block">
            <div className="feature-text reveal-left">
              <div className="feature-tag mono">CONTROL</div>
              <h3 className="feature-title serif">Agents with <em>rules.</em><br />Not guesses.</h3>
              <p className="feature-body">Every department runs on the Crost Constitution — eight non-negotiable rules that govern agent behaviour, always. Agents never send, merge, or spend without your explicit sign-off. This is not a toggle. It is structural.</p>
              <div className="feature-detail mono">
                <div><span>→</span> Approval Feed for all irreversible actions</div>
                <div><span>→</span> Risk levels: low / medium / high / critical</div>
                <div><span>→</span> Constitution inspired by state-of-the-art safety architecture</div>
              </div>
            </div>
            <div className="feature-visual reveal-right">
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: "var(--text3)", letterSpacing: ".1em", marginBottom: 14 }}>AGENT CONSTITUTION</div>
              {[
                ["NEVER", "take an irreversible action without approval"],
                ["NEVER", "fabricate data, metrics, or facts"],
                ["ALWAYS", "check memos before starting a task"],
                ["ALWAYS", "surface uncertainty rather than guessing"],
                ["ALWAYS", "log task start, completion, and errors"],
              ].map(([kw, rest], i) => (
                <div key={i} className="constitution-clause">
                  <div className="clause-num">{i + 1}.</div>
                  <div className="clause-text"><strong>{kw}</strong> {rest}</div>
                </div>
              ))}
              <div style={{ marginTop: 12, padding: "8px 10px", background: "var(--accent2)", borderRadius: 6, border: "1px solid var(--accent3)" }}>
                <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: "var(--accent)" }}>Founders can add clauses. Core rules cannot be removed.</div>
              </div>
            </div>
          </div>

          {/* Feature 2: Approvals */}
          <div className="feature-block reverse">
            <div className="feature-text reveal-right">
              <div className="feature-tag mono">OVERSIGHT</div>
              <h3 className="feature-title serif">Your sign-off.<br /><em>Every time.</em></h3>
              <p className="feature-body">When an agent wants to act — send that email, merge that PR, post that content — it stops and waits. You see exactly what it wants to do and why. One click approves. One click rejects. You're always in control.</p>
              <div className="feature-detail mono">
                <div><span>→</span> Pending approvals expire after 24 hours</div>
                <div><span>→</span> Full payload preview before you decide</div>
                <div><span>→</span> Rejection reason fed back to the agent</div>
              </div>
            </div>
            <div className="feature-visual reveal-left">
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: "var(--text3)", letterSpacing: ".1em", marginBottom: 12 }}>APPROVAL FEED</div>
              {[
                { dept: "Marketing", label: "Send launch announcement to 40 beta contacts", risk: "medium", riskClass: "high" },
                { dept: "Sales", label: "Email intro offer to 12 warm leads", risk: "high", riskClass: "critical" },
              ].map((a, i) => (
                <div key={i} className="approval-visual-item">
                  <div className="approval-visual-header">
                    <span className="approval-visual-dept mono">{a.dept}</span>
                    <span className={`risk-pill ${a.riskClass}`}>{a.risk.toUpperCase()}</span>
                  </div>
                  <div className="approval-visual-label">{a.label}</div>
                  <div className="approval-visual-btns">
                    <button className="av-btn approve">✓ Approve</button>
                    <button className="av-btn reject">✗ Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Feature 3: Memos */}
          <div className="feature-block">
            <div className="feature-text reveal-left">
              <div className="feature-tag mono">COORDINATION</div>
              <h3 className="feature-title serif">Departments that<br /><em>talk to each other.</em></h3>
              <p className="feature-body">When Marketing promises a feature, Engineering knows before it starts coding. When Operations flags a budget constraint, Sales stops quoting numbers that don't exist. The memo system is your company's shared memory — written by agents, read by agents, always current.</p>
              <div className="feature-detail mono">
                <div><span>→</span> Agents write memos after significant tasks</div>
                <div><span>→</span> Every agent reads the memo brief before starting</div>
                <div><span>→</span> Priority levels: low / normal / high / urgent</div>
              </div>
            </div>
            <div className="feature-visual reveal-right">
              <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: "var(--text3)", letterSpacing: ".1em", marginBottom: 12 }}>COMPANY MEMOS</div>
              {[
                { priority: "urgent", title: "Launch budget capped at $2,000", body: "Plan campaigns inside the cap. No paid spend without approval.", from: "Operations" },
                { priority: "high", title: "Payments ship Friday", body: "Do not promise payment features before then.", from: "Engineering" },
              ].map((m, i) => (
                <div key={i} className={`memo-visual-item ${m.priority}`}>
                  <div className="memo-visual-title">{m.title}</div>
                  <div className="memo-visual-body">{m.body}</div>
                  <div className="memo-visual-from">from {m.from}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="how" id="how">
        <div className="how-inner">
          <div className="section-label mono reveal">How It Works</div>
          <h2 className="how-headline serif reveal">
            Up and running<br />in <em>a few minutes.</em>
          </h2>
          <div className="steps">
            {[
              { n: "1", title: "Tell Crost about your company", body: "Name, market and stage. Crost reflects your context back so every department starts calibrated for your business." },
              { n: "2", title: "Give Orc a goal", body: "One sentence is enough. Orc asks a clarifying question if it needs one, then plans 3–5 tasks." },
              { n: "3", title: "Departments get to work", body: "Marketing, Sales, Operations and Engineering each take their tasks and produce drafts, documents and memos." },
              { n: "4", title: "You approve what ships", body: "Anything external — an email, a post, a spend — stops at the approval gate. Approve, reject, or ask for changes." },
              ].map((s, i) => (
              <div 
                key={s.n} 
                className={`step reveal delay-${i + 1}`}
              >
                <div className="step-num-wrap mono">{s.n}</div>
                <div className="step-title serif">{s.title}</div>
                <div className="step-body">{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GLOBAL */}
      <section className="global-section" id="global">
        <div className="global-inner">
          <div className="reveal-left">
            <div className="section-label mono">Global</div>
            <h2 className="global-headline serif">
              Built for founders<br /><em>everywhere.</em>
            </h2>
            <p className="global-body">There are no hardcoded assumptions in Crost. No default market. No assumed language. Every founder configures their own Local Identity — tone, cultural nuance, market context — and it flows through every department, every output, every interaction.</p>
            <div className="global-tags">
              {["Lagos", "Jakarta", "Nairobi", "São Paulo", "Karachi", "Manila", "Cairo", "Accra"].map(c => (
                <span key={c} className="global-tag">{c}</span>
              ))}
            </div>
          </div>
          <div className="globe-visual reveal-right">
            {[
              { flag: "🇳🇬", city: "Lagos, Nigeria", founder: "B2B credit for informal retail", mode: "CLOUD" },
              { flag: "🇮🇩", city: "Jakarta, Indonesia", founder: "SME logistics marketplace", mode: "CLOUD" },
              { flag: "🇧🇷", city: "São Paulo, Brazil", founder: "Embedded finance for merchants", mode: "CLOUD" },
              { flag: "🇰🇪", city: "Nairobi, Kenya", founder: "AgriTech platform for farmers", mode: "CLOUD" },
            ].map((r, i) => (
              <div key={i} className="globe-row">
                <div className="globe-flag">{r.flag}</div>
                <div className="globe-info">
                  <div className="globe-city">{r.city}</div>
                  <div className="globe-founder">{r.founder}</div>
                </div>
                <div className="globe-mode mono">{r.mode}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section" id="cta">
        <div className="cta-eyebrow mono reveal">Beta</div>
        <h2 className="cta-headline serif reveal delay-1">
          Your office is<br /><em>waiting for you.</em>
        </h2>
        <p className="cta-sub reveal delay-2">
          The beta is open and free. Create your account and hand Orc your first goal in minutes.
        </p>

        <div className="reveal delay-3">
          <a className="btn-primary" href="/signup?source=landing" style={{ display: 'inline-block', textDecoration: 'none' }}>
            Try the beta
          </a>
          <div className="cta-note mono">By continuing, you agree to our <span className="nav-link" style={{ fontSize: 11 }} onClick={() => navigate('terms')}>Terms of Service</span> and <span className="nav-link" style={{ fontSize: 11 }} onClick={() => navigate('privacy')}>Privacy Policy</span>.</div>
        </div>
      </section>
    </>
  )
}
