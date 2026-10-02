'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// NOTE: draft legal copy brought in line with the beta product (hosting on
// Vercel, Supabase, Gemini API; no local/MCP/BYOK modes). It has NOT been
// reviewed by counsel — have it reviewed before public launch.

function BackToTop() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <div className={`back-to-top ${visible ? 'visible' : ''}`} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
    </div>
  )
}

export function PrivacyPage() {
  return (
    <div className="legal-container">
      <h1 className="legal-title">Privacy Policy</h1>
      <span className="legal-updated">Last Updated: October 1, 2026</span>

      <div className="legal-toc">
        <h2>Table of Contents</h2>
        <ul>
          <li><a href="#who">1. Who We Are</a></li>
          <li><a href="#collect">2. What Information We Collect</a></li>
          <li><a href="#use">3. How We Use Your Information</a></li>
          <li><a href="#ai">4. AI Agents and Data Processing</a></li>
          <li><a href="#third">5. Third-Party Services</a></li>
          <li><a href="#google">6. Google Sign-In and Gmail</a></li>
          <li><a href="#storage">7. Data Storage and Security</a></li>
          <li><a href="#retention">8. Data Retention</a></li>
          <li><a href="#rights">9. Your Rights</a></li>
          <li><a href="#children">10. Children&apos;s Privacy</a></li>
          <li><a href="#changes">11. Changes to This Policy</a></li>
          <li><a href="#contact">12. Contact Us</a></li>
        </ul>
      </div>

      <div className="legal-content">
        <section id="who" className="legal-section">
          <h3>1. Who We Are</h3>
          <p>Crost Limited is a company incorporated in Nigeria. We operate the Crost Agentic Operating System and this website, both at crosthq.com.</p>
          <p><strong>Registered Name:</strong> Crost Limited<br /><strong>Country:</strong> Nigeria<br /><strong>Contact:</strong> privacy@crosthq.com</p>
        </section>
        <section id="collect" className="legal-section">
          <h3>2. What Information We Collect</h3>
          <p>We collect information you provide directly (name, email, business description), information generated through use (goals, plans, documents, memos, approval history), and, if you choose to connect it, authorisation to send email from your Google account.</p>
        </section>
        <section id="use" className="legal-section">
          <h3>3. How We Use Your Information</h3>
          <p>We use your data to provide the service, improve the product through anonymised usage patterns, communicate service updates, and ensure security. We do not sell your personal data or use it for advertising.</p>
        </section>
        <section id="ai" className="legal-section">
          <h3>4. AI Agents and Data Processing</h3>
          <p>Crost uses AI language models to power Orc and your department agents. The text of your goals, company context and related memos is sent to our AI model provider (currently Google&apos;s Gemini API) to generate plans and drafts, under that provider&apos;s API terms. Crost never sends email or takes any other external action without your approval.</p>
        </section>
        <section id="third" className="legal-section">
          <h3>5. Third-Party Services</h3>
          <p>We use Supabase (authentication, database, file storage), Vercel (hosting), Google (Gemini API; Gmail if you connect it), PostHog (product analytics). Each has its own privacy policy which we encourage you to review.</p>
        </section>
        <section id="google" className="legal-section">
          <h3>6. Google Sign-In and Gmail</h3>
          <p>You can sign in with Google. If you separately connect Gmail, Crost stores an access and refresh token solely to send messages that you have approved, and you can disconnect at any time. Crost&apos;s use of information received from Google APIs adheres to the Google API Services User Data Policy.</p>
        </section>
        <section id="storage" className="legal-section">
          <h3>7. Data Storage and Security</h3>
          <p>Your data is stored with Supabase (PostgreSQL and object storage) with TLS in transit and encryption at rest. Access to your data is restricted to your account and enforced on the server for every request.</p>
        </section>
        <section id="retention" className="legal-section">
          <h3>8. Data Retention</h3>
          <p>We keep your workspace data while your account is active. You can ask us to delete your account and data at any time at privacy@crosthq.com.</p>
        </section>
        <section id="rights" className="legal-section">
          <h3>9. Your Rights</h3>
          <p>Under the NDPA 2023, you have the right to access, rectify, or erase your data. Contact privacy@crosthq.com to exercise these rights.</p>
        </section>
        <section id="children" className="legal-section">
          <h3>10. Children&apos;s Privacy</h3>
          <p>Crost is not directed at anyone under 18 and we do not knowingly collect their data.</p>
        </section>
        <section id="changes" className="legal-section">
          <h3>11. Changes to This Policy</h3>
          <p>We will post changes here and update the date above. Material changes will be notified by email.</p>
        </section>
        <section id="contact" className="legal-section">
          <h3>12. Contact Us</h3>
          <p>For privacy questions: privacy@crosthq.com<br />Security issues: security@crosthq.com</p>
        </section>
      </div>

      <div style={{ marginTop: 80, borderTop: '1px solid var(--border)', paddingTop: 40, display: 'flex', gap: 20 }}>
        <Link href="/terms" style={{ color: 'var(--text2)', textDecoration: 'none' }}>Terms of Service</Link>
        <Link href="/" style={{ color: 'var(--text2)', textDecoration: 'none' }}>Back to Home</Link>
      </div>
      <BackToTop />
    </div>
  )
}

export function TermsPage() {
  return (
    <div className="legal-container">
      <h1 className="legal-title">Terms of Service</h1>
      <span className="legal-updated">Last Updated: October 1, 2026</span>

      <div className="legal-toc">
        <h2>Table of Contents</h2>
        <ul>
          <li><a href="#agreement">1. Agreement to Terms</a></li>
          <li><a href="#service">2. The Crost Service (Beta)</a></li>
          <li><a href="#ai">3. AI Agents and Constitution</a></li>
          <li><a href="#connected">4. Connected Services</a></li>
          <li><a href="#billing">5. Beta Access and Payment</a></li>
          <li><a href="#liability">6. Disclaimers and Limitation of Liability</a></li>
          <li><a href="#law">7. Governing Law</a></li>
        </ul>
      </div>

      <div className="legal-content">
        <section id="agreement" className="legal-section">
          <h3>1. Agreement to Terms</h3>
          <p>By creating an account or using the service, you agree to be bound by these Terms. Crost is operated by Crost Limited, Nigeria. You must be at least 18 years old.</p>
        </section>
        <section id="service" className="legal-section">
          <h3>2. The Crost Service (Beta)</h3>
          <p>Crost is an Agentic Operating System offered as a beta: features may change, and the service may be interrupted. It is not a financial or legal advisor. You are solely responsible for reviewing and approving any agent output before it is used or sent.</p>
        </section>
        <section id="ai" className="legal-section">
          <h3>3. AI Agents and the Crost Constitution</h3>
          <p>Agents are bound by the Crost Constitution. You acknowledge that AI outputs are probabilistic and may contain errors. Founder approval is required before any external action (such as sending an email) is carried out.</p>
        </section>
        <section id="connected" className="legal-section">
          <h3>4. Connected Services</h3>
          <p>If you connect Gmail, you authorise Crost to send emails from your account only after you approve each one. You are responsible for the content of messages you approve.</p>
        </section>
        <section id="billing" className="legal-section">
          <h3>5. Beta Access and Payment</h3>
          <p>The beta is free. Fair-use limits on AI usage apply. If we introduce paid plans we will give notice first and nothing will be charged without your explicit consent.</p>
        </section>
        <section id="liability" className="legal-section">
          <h3>6. Disclaimers and Limitation of Liability</h3>
          <p>The Service is provided &quot;AS IS&quot;. To the maximum extent permitted by Nigerian law, our liability is limited to the amount you paid us in the past 12 months or $100, whichever is greater.</p>
        </section>
        <section id="law" className="legal-section">
          <h3>7. Governing Law</h3>
          <p>These terms are governed by the laws of Nigeria. Disputes will be resolved in the courts of Nigeria after a 30-day informal resolution attempt.</p>
        </section>
      </div>

      <div style={{ marginTop: 80, borderTop: '1px solid var(--border)', paddingTop: 40, display: 'flex', gap: 20 }}>
        <Link href="/privacy" style={{ color: 'var(--text2)', textDecoration: 'none' }}>Privacy Policy</Link>
        <Link href="/" style={{ color: 'var(--text2)', textDecoration: 'none' }}>Back to Home</Link>
      </div>
      <BackToTop />
    </div>
  )
}
