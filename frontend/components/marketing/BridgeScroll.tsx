'use client'

// Scroll-driven hero: a bridge between "You" and "Shipped" across a day-to-dusk
// skyline. Ported from the Bridge Scroll design (Claude Design handoff).
//
//  - Progress comes from the PAGE scroll position through a 400vh wrapper (no
//    inner scroller, no scroll hijacking, no autoplay).
//  - The scene is a 1920x1080 stage scaled to COVER the viewport; the copy sits
//    in a separate responsive layer so it stays legible on phones.
//  - prefers-reduced-motion: ambient motion (birds, clouds, packet) is off and
//    progress follows scroll without easing.
//  - The loop pauses while the hero is off-screen.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { MARKETING } from '@/lib/marketing-config'

const N = 4 // copy panels
const RANGE = 4800 - 1920 // horizontal travel of the main layer

const DEPTS = [
  { name: 'Marketing', slug: '/marketing', color: '#b86bff' },
  { name: 'Sales', slug: '/sales', color: '#ff8a3d' },
  { name: 'Operations', slug: '/operations', color: '#4da6ff' },
  { name: 'Engineering', slug: '/engineering', color: '#22d3ee' },
]
// Four departments + Orc (the accent) light the skyline windows in sequence.
const WINDOW_COLORS = [...DEPTS.map((d) => d.color), '#00d4aa']

function buildGeo() {
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const path = (w: number, f: (x: number) => number) => {
    let d = `M0 1080 L0 ${f(0)}`
    for (let x = 40; x <= w; x += 40) d += ` L${x} ${f(x).toFixed(1)}`
    return d + ` L${w} 1080 Z`
  }
  const far = path(2800, (x) => 700 - 60 * Math.sin(x / 260) - 40 * Math.sin(x / 97 + 1) - 30 * Math.sin(x / 520 + 2))
  const mid = path(3700, (x) => 830 - 50 * Math.sin(x / 180 + 0.5) - 22 * Math.sin(x / 70))
  let landL = 'M0 890 L0 860'
  for (let x = 40; x <= 1560; x += 40) {
    const y =
      870 -
      110 * Math.exp(-Math.pow((x - 650) / 360, 2)) -
      30 * Math.sin(x / 120) * Math.exp(-Math.pow((x - 650) / 500, 2)) +
      (x > 1380 ? (x - 1380) * 0.08 : 0)
    landL += ` L${x} ${y.toFixed(1)}`
  }
  landL += ' L1560 890 Z'

  const hangers: { x: number; y: string }[] = []
  for (let x = 1950; x <= 3050; x += 50) {
    const u = (x - 1900) / 1200
    hangers.push({ x, y: ((1 - u) * (1 - u) * 450 + 2 * (1 - u) * u * 1110 + u * u * 450).toFixed(1) })
  }

  const groups = WINDOW_COLORS.map((color) => ({ color, wins: [] as { x: number; y: number }[] }))
  const dark: { x: number; y: number }[] = []
  const buildings: { x: number; y: number; w: number; h: number; fill: string }[] = []
  let x = 3480
  let bi = 0
  while (x < 4780) {
    const w = Math.round(56 + rnd() * 90)
    const peak = Math.exp(-Math.pow((x - 4100) / 420, 2))
    const h = Math.round(110 + rnd() * 160 + peak * 260)
    const top = 870 - h
    buildings.push({ x, y: top, w, h, fill: bi % 2 ? '#1f1f25' : '#18181c' })
    const cols = Math.floor((w - 16) / 18)
    const rows = Math.floor((h - 34) / 26)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const win = { x: x + 12 + c * 18, y: top + 18 + r * 26 }
        if (rnd() < 0.5) groups[(bi + r) % groups.length].wins.push(win)
        else dark.push(win)
      }
    }
    x += w + 10
    bi++
  }

  const stars: { x: number; y: number; r: string; o: string }[] = []
  for (let i = 0; i < 90; i++) {
    stars.push({ x: Math.round(rnd() * 1920), y: Math.round(rnd() * 560), r: (0.6 + rnd() * 1.4).toFixed(1), o: (0.3 + rnd() * 0.6).toFixed(2) })
  }
  const shimmer: { x: number; y: number; x2: number }[] = []
  for (let i = 0; i < 26; i++) {
    const sx = Math.round(rnd() * 2000) - 40
    const sy = Math.round(900 + rnd() * 170)
    shimmer.push({ x: sx, y: sy, x2: sx + Math.round(20 + rnd() * 60) })
  }
  return { far, mid, landL, hangers, groups, dark, buildings, stars, shimmer }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

const FONT_CSS = `
.bridge-copy h2,.bridge-copy .bridge-h{font-family:'Fraunces',serif;font-weight:400;line-height:1.05;letter-spacing:-0.02em;color:#e8e8f0;margin:0}
.bridge-copy em{font-style:italic;color:#00d4aa}
.bridge-eyebrow{font-family:'Inter',sans-serif;letter-spacing:.12em;color:#8a8a9e;font-size:clamp(11px,1.15vw,22px)}
.bridge-h{font-size:clamp(34px,5.4vw,104px)}
.bridge-sub{font-family:'Inter',sans-serif;color:#b1b1c1;line-height:1.45;font-size:clamp(15px,1.5vw,28px);max-width:min(900px,88vw);margin:0}
.bridge-btn{display:inline-flex;align-items:center;height:clamp(44px,3.2vw,60px);padding:0 clamp(18px,1.6vw,30px);border-radius:100px;font-family:'Inter',sans-serif;font-size:clamp(14px,1.15vw,22px);text-decoration:none;cursor:pointer;transition:background .2s,border-color .2s}
.bridge-btn.primary{background:#00d4aa;color:#09090b;font-weight:500;border:1px solid #00d4aa}
.bridge-btn.primary:hover{background:#00efc0}
.bridge-btn.ghost{border:1px solid rgba(255,255,255,.13);color:#e8e8f0;background:transparent}
.bridge-btn.ghost:hover{background:rgba(255,255,255,.05)}
.bridge-chip{display:flex;align-items:center;gap:10px;height:clamp(40px,3.1vw,60px);padding:0 clamp(12px,1.1vw,22px);border-radius:10px;background:rgba(20,20,25,.7);border:1px solid rgba(255,255,255,.07)}
.bridge-dot{width:12px;height:12px;border-radius:50%;cursor:pointer;padding:0;border:1.5px solid rgba(255,255,255,.25);background:transparent}
.bridge-dot.on{background:#00d4aa;border-color:#00d4aa}
`

export default function BridgeScroll() {
  const geo = useMemo(buildGeo, [])
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const el = useRef<Record<string, HTMLElement | SVGElement | null>>({})
  const groupRefs = useRef<(SVGGElement | null)[]>([])
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)

  const setRef = (k: string) => (node: HTMLElement | SVGElement | null) => {
    el.current[k] = node
  }

  const jump = useCallback((i: number) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const max = wrap.offsetHeight - window.innerHeight
    const top = wrap.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: top + (max * i) / (N - 1), behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const wrap = wrapRef.current
    const stage = stageRef.current
    if (!wrap || !stage) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let p = 0
    let raf = 0
    let visible = true
    let prev = performance.now()
    const t0 = prev

    // Scene covers the viewport (design is 16:9; phones show a centred slice).
    const onResize = () => {
      const s = Math.max(window.innerWidth / 1920, window.innerHeight / 1080)
      stage.style.transform = `translate(-50%,-50%) scale(${s})`
    }
    onResize()
    window.addEventListener('resize', onResize)

    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting }, { threshold: 0 })
    io.observe(wrap)

    const set = (k: string, css: Partial<CSSStyleDeclaration>) => {
      const node = el.current[k] as HTMLElement | null
      if (node) Object.assign(node.style, css)
    }

    const apply = (pp: number, t: number) => {
      const ta = reduce ? 0 : t
      set('far', { transform: `translateX(${-pp * RANGE * 0.3}px)` })
      set('mid', { transform: `translateX(${-pp * RANGE * 0.6}px)` })
      set('main', { transform: `translateX(${-pp * RANGE}px)` })
      set('sky1', { opacity: String(clamp01(pp * 1.2)) })
      set('sky0', { opacity: String(1 - clamp01(pp * 0.8)) })
      set('stars', { opacity: String(1 - clamp01(pp * 1.6)) })
      const lerp = (a: number, b: number, k: number) => Math.round(a + (b - a) * k)
      const sunC = `rgb(${lerp(200, 255, pp)},${lerp(200, 179, pp)},${lerp(216, 71, pp)})`
      set('sun', {
        transform: `translate(${300 + pp * 1350}px, ${300 - Math.sin(Math.PI * pp) * 150 + pp * 60}px)`,
        background: sunC,
        boxShadow: `0 0 ${60 + pp * 60}px ${sunC}55`,
      })

      const f = pp * (N - 1)
      for (let i = 0; i < N; i++) {
        const d = f - i
        const o = clamp01(1 - Math.abs(d) * 2.4)
        set(`s${i}`, { opacity: String(o), transform: `translateY(${-d * 40}px)`, pointerEvents: o > 0.5 ? 'auto' : 'none', visibility: o > 0.01 ? 'visible' : 'hidden' })
      }
      set('hint', { opacity: String(clamp01(1 - pp * 10)) })

      geo.groups.forEach((g, i) => {
        const lit = clamp01((pp - (0.5 + i * 0.08)) / 0.1)
        groupRefs.current[i]?.setAttribute('opacity', (0.12 + 0.88 * lit).toFixed(3))
      })

      const clouds = el.current.clouds
      if (clouds) {
        Array.from(clouds.children).forEach((c, i) => {
          const sp = 10 + i * 6
          const base = i * 560
          ;(c as HTMLElement).style.transform = `translateX(${((((base + ta * sp - pp * 300) % 2600) + 2600) % 2600) - 600}px)`
        })
      }
      const packet = el.current.packet
      if (packet) {
        const u = (ta % 4.5) / 4.5
        packet.setAttribute('transform', `translate(${1500 + u * 2000} 0)`)
        ;(packet as unknown as HTMLElement).style.opacity = reduce ? '0' : String(Math.min(1, Math.sin(Math.PI * u) * 3))
      }
      const shimmer = el.current.shimmer
      if (shimmer) shimmer.setAttribute('transform', `translate(${-((ta * 24 + pp * 400) % 80)} 0)`)
      const birds = el.current.birds
      if (birds) {
        Array.from(birds.children).forEach((b, i) => {
          const sp = 70 + i * 12
          const x = ((ta * sp + i * 90) % 2300) - 200
          const y = 330 + i * 26 + Math.sin(ta * 0.8 + i) * 12
          const fl = 0.4 + 0.6 * Math.abs(Math.sin(ta * 6 + i))
          b.setAttribute('transform', `translate(${x} ${y}) scale(1 ${fl.toFixed(2)})`)
          ;(b as unknown as HTMLElement).style.opacity = reduce ? '0' : '1'
        })
      }

      const a = Math.round(f)
      if (a !== activeRef.current) {
        activeRef.current = a
        setActive(a)
      }
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (!visible) { prev = now; return }
      const dt = Math.min(0.05, (now - prev) / 1000)
      prev = now
      const max = Math.max(1, wrap.offsetHeight - window.innerHeight)
      const target = clamp01(-wrap.getBoundingClientRect().top / max)
      p = reduce ? target : p + (target - p) * (1 - Math.exp(-dt * 5))
      apply(p, (now - t0) / 1000)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      io.disconnect()
    }
  }, [geo])

  return (
    <section ref={wrapRef} aria-label="Crost overview" style={{ height: '400vh', position: 'relative', background: '#09090b' }}>
      <style dangerouslySetInnerHTML={{ __html: FONT_CSS }} />
      <div style={{ position: 'sticky', top: 0, height: '100vh', width: '100%', overflow: 'hidden', background: '#09090b' }}>
        {/* ── Scene (decorative) ─────────────────────────────────────────── */}
        <div
          ref={stageRef}
          aria-hidden="true"
          style={{ position: 'absolute', left: '50%', top: '54%', width: 1920, height: 1080, transform: 'translate(-50%,-50%) scale(0.5)', overflow: 'hidden', background: '#09090b' }}
        >
          <div ref={setRef('sky0')} style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(77,166,255,0.10), transparent 60%), linear-gradient(#09090b, #0d0d12 70%, #111118)' }} />
          <div ref={setRef('sky1')} style={{ position: 'absolute', inset: 0, opacity: 0, background: 'radial-gradient(ellipse at 75% 85%, rgba(255,179,71,0.20), transparent 55%), radial-gradient(ellipse at 30% 90%, rgba(0,212,170,0.10), transparent 50%), linear-gradient(#0b0b0f, #15131a 55%, #241c1c)' }} />
          <svg ref={setRef('stars')} width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
            {geo.stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#b1b1c1" opacity={s.o} />)}
          </svg>
          <div ref={setRef('sun')} style={{ position: 'absolute', left: 0, top: 0, width: 84, height: 84, margin: '-42px 0 0 -42px', borderRadius: '50%', background: '#c8c8d8' }} />
          <div ref={setRef('clouds')} style={{ position: 'absolute', inset: 0 }}>
            {[
              { top: 150, w: 520, h: 90, a: 0.05 },
              { top: 300, w: 700, h: 110, a: 0.04 },
              { top: 90, w: 420, h: 70, a: 0.05 },
              { top: 420, w: 600, h: 90, a: 0.035 },
            ].map((c, i) => (
              <div key={i} style={{ position: 'absolute', left: 0, top: c.top, width: c.w, height: c.h, borderRadius: '50%', background: `radial-gradient(ellipse, rgba(232,232,240,${c.a}), transparent 70%)` }} />
            ))}
          </div>

          <svg ref={setRef('far')} width="2800" height="1080" style={{ position: 'absolute', left: 0, top: 0 }}><path d={geo.far} fill="#121216" /></svg>
          <svg ref={setRef('mid')} width="3700" height="1080" style={{ position: 'absolute', left: 0, top: 0 }}><path d={geo.mid} fill="#16161b" /></svg>
          <svg ref={setRef('main')} width="4800" height="1080" style={{ position: 'absolute', left: 0, top: 0 }}>
            <path d={geo.landL} fill="#1a1a20" />
            <rect x="0" y="880" width="4800" height="200" fill="#0b0b0e" />
            <rect x="3440" y="868" width="1360" height="20" fill="#1a1a20" />
            <path d="M1500 800 Q1800 760 1900 450" fill="none" stroke="#00d4aa" strokeWidth="3" strokeOpacity="0.85" />
            <path d="M3100 450 Q3200 760 3500 800" fill="none" stroke="#00d4aa" strokeWidth="3" strokeOpacity="0.85" />
            <path d="M1900 450 Q2500 1110 3100 450" fill="none" stroke="#00d4aa" strokeWidth="3" strokeOpacity="0.85" />
            <g stroke="#00d4aa" strokeOpacity="0.3" strokeWidth="1.5">
              {geo.hangers.map((h) => <line key={h.x} x1={h.x} y1={h.y} x2={h.x} y2="798" />)}
            </g>
            <rect x="1480" y="796" width="2040" height="12" fill="#1f1f25" stroke="rgba(0,212,170,0.45)" />
            <g fill="#1f1f25" stroke="rgba(0,212,170,0.6)" strokeWidth="2">
              <rect x="1882" y="430" width="36" height="470" /><rect x="3082" y="430" width="36" height="470" />
              <rect x="1872" y="520" width="56" height="14" /><rect x="3072" y="520" width="56" height="14" />
              <rect x="1872" y="650" width="56" height="14" /><rect x="3072" y="650" width="56" height="14" />
            </g>
            <g opacity="0.14" transform="translate(0 1680) scale(1 -1)">
              <rect x="1882" y="790" width="36" height="110" fill="#00d4aa" /><rect x="3082" y="790" width="36" height="110" fill="#00d4aa" />
            </g>
            {geo.buildings.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.fill} stroke="rgba(255,255,255,0.05)" />)}
            <g fill="rgba(255,255,255,0.045)">
              {geo.dark.map((w, i) => <rect key={i} x={w.x} y={w.y} width="8" height="12" rx="1" />)}
            </g>
            {geo.groups.map((g, gi) => (
              <g key={gi} ref={(n) => { groupRefs.current[gi] = n }} fill={g.color} opacity="0.12">
                {g.wins.map((w, i) => <rect key={i} x={w.x} y={w.y} width="8" height="12" rx="1" />)}
              </g>
            ))}
            <g ref={setRef('packet')}>
              <circle cx="0" cy="790" r="14" fill="rgba(0,212,170,0.18)" />
              <circle cx="0" cy="790" r="6" fill="#00d4aa" />
            </g>
          </svg>
          <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <g ref={setRef('shimmer')} stroke="rgba(232,232,240,0.06)" strokeWidth="2" strokeLinecap="round">
              {geo.shimmer.map((s, i) => <line key={i} x1={s.x} y1={s.y} x2={s.x2} y2={s.y} />)}
            </g>
            <g ref={setRef('birds')} fill="none" stroke="#8a8a9e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M-12 0 L0 6 L12 0" /><path d="M-10 0 L0 5 L10 0" /><path d="M-9 0 L0 4 L9 0" />
            </g>
          </svg>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 560, background: 'radial-gradient(ellipse at 50% 35%, rgba(9,9,11,0.55), transparent 65%)', pointerEvents: 'none' }} />
        </div>

        {/* Readability scrim behind the copy */}
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 30%, rgba(9,9,11,0.55), transparent 70%)', pointerEvents: 'none' }} />

        {/* ── Copy (responsive, accessible) ──────────────────────────────── */}
        <div className="bridge-copy" style={{ position: 'absolute', inset: 0 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              ref={setRef(`s${i}`)}
              style={{ position: 'absolute', left: 0, right: 0, top: 'clamp(96px, 19vh, 210px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(14px, 2.6vh, 28px)', textAlign: 'center', padding: '0 20px', opacity: i === 0 ? 1 : 0, visibility: i === 0 ? 'visible' : 'hidden' }}
            >
              {i === 0 && (
                <>
                  <h1 className="bridge-h">The <em>fastest</em> way<br />to run a company.</h1>
                  <p className="bridge-sub">One founder, four AI departments, one chief of staff.<br />Nothing ships without your approval.</p>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
                    <Link href={MARKETING.ctaHref} className="bridge-btn primary">{MARKETING.ctaLabel}</Link>
                    <button type="button" className="bridge-btn ghost" onClick={() => jump(1)}>See how it works</button>
                  </div>
                </>
              )}
              {i === 1 && (
                <>
                  <div className="bridge-eyebrow">WHO IT&apos;S FOR</div>
                  <h2 className="bridge-h" style={{ fontSize: 'clamp(32px,5vw,96px)' }}>Start alone.<br />Build a <em>whole</em> company.</h2>
                  <p className="bridge-sub">Most founders start with an idea and no team.<br />Crost gives you Marketing, Sales, Operations and Engineering on day one.</p>
                </>
              )}
              {i === 2 && (
                <>
                  <div className="bridge-eyebrow">HOW IT WORKS</div>
                  <h2 className="bridge-h" style={{ fontSize: 'clamp(32px,5vw,96px)' }}>Set the goal.<br />Approve <em>what</em> ships.</h2>
                  <p className="bridge-sub">Orc breaks goals into tasks and routes them to departments.<br />Every draft waits at an approval gate until you sign off.</p>
                </>
              )}
              {i === 3 && (
                <>
                  <div className="bridge-eyebrow">THE OFFICE</div>
                  <h2 className="bridge-h" style={{ fontSize: 'clamp(32px,5vw,96px)' }}>Four departments.<br /><em>One</em> chief of staff.</h2>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
                    {DEPTS.map((d) => (
                      <div key={d.name} className="bridge-chip">
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color }} />
                        <span style={{ fontFamily: "'Fraunces',sans-serif", fontWeight: 700, fontSize: 'clamp(15px,1.25vw,24px)', color: '#e8e8f0' }}>{d.name}</span>
                        <span className="bridge-eyebrow" style={{ fontSize: 'clamp(10px,.95vw,18px)' }}>{d.slug}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}

          <div ref={setRef('hint')} aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 28, display: 'flex', justifyContent: 'center' }} className="bridge-eyebrow">SCROLL</div>

          <div role="tablist" aria-label="Hero sections" style={{ position: 'absolute', right: 'clamp(10px,2.4vw,56px)', top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[0, 1, 2, 3].map((i) => (
              <button key={i} type="button" role="tab" aria-selected={i === active} aria-label={`Section ${i + 1}`} className={`bridge-dot${i === active ? ' on' : ''}`} onClick={() => jump(i)} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
