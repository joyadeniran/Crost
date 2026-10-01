// Marketing-site styles. Rendered inside <style> by MarketingShell so they mount and
// unmount with the marketing routes and can never leak into the product UI.

export const MARKETING_FONTS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,700;0,9..144,800;1,9..144,300;1,9..144,400;1,9..144,700&family=DM+Mono:wght@300;400;500&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');`

export const MARKETING_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:#08080b;
  --bg2:#0f0f14;
  --bg3:#15151c;
  --bg4:#1c1c26;
  --border:rgba(255,255,255,0.07);
  --border2:rgba(255,255,255,0.12);
  --text:#eeeef5;
  --text2:#8888a0;
  --text3:#48485a;
  --accent:#00d4aa;
  --accent2:rgba(0,212,170,0.1);
  --accent3:rgba(0,212,170,0.18);
  --red:#ff4d6d;
  --amber:#f59e0b;
  --blue:#60a5fa;
  --ease-out-expo:cubic-bezier(0.16,1,0.3,1);
  --ease-spring:cubic-bezier(0.34,1.56,0.64,1);
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important;}
}
html{scroll-behavior:smooth;}
body{
  background:var(--bg);
  color:var(--text);
  font-family:'DM Sans',sans-serif;
  font-size:16px;
  line-height:1.6;
  overflow-x:hidden;
  -webkit-font-smoothing:antialiased;
}
/* LEGAL PAGES CUSTOM STYLES */
.legal-container {
  max-width: 720px;
  margin: 0 auto;
  padding: 120px 24px 80px;
  animation: fadeIn 0.6s var(--ease-out-expo);
}
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.legal-title {
  font-family: 'Fraunces', serif;
  font-size: clamp(32px, 5vw, 48px);
  font-weight: 700;
  margin-bottom: 8px;
  letter-spacing: -0.02em;
}

.legal-updated {
  font-family: 'DM Mono', monospace;
  font-size: 12px;
  color: var(--text3);
  margin-bottom: 40px;
  display: block;
}
.legal-toc {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 48px;
}
.legal-toc h2 {
  font-family: 'Fraunces', serif;
  font-size: 16px;
  margin-bottom: 16px;
  color: var(--text);
}

.legal-toc ul { list-style: none; display: grid; gap: 8px; }
.legal-toc a {
  color: var(--text2);
  text-decoration: none;
  font-size: 14px;
  transition: color 0.2s;
}
.legal-toc a:hover { color: var(--accent); }
.legal-section { margin-bottom: 48px; position: relative; }
.legal-section h3 {
  font-family: 'Fraunces', serif;
  font-size: 22px;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.legal-section h3::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 40px;
  height: 2px;
  background: #1D9E75;
}
.legal-content p { margin-bottom: 16px; color: var(--text2); font-size: 15px; line-height: 1.7; }
.legal-content ul { padding-left: 20px; margin-bottom: 16px; color: var(--text2); }
.legal-content li { margin-bottom: 8px; }
.legal-content strong { color: var(--text); }
.back-to-top {
  position: fixed;
  bottom: 32px;
  right: 32px;
  width: 44px;
  height: 44px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1000;
  transition: all 0.3s;
  opacity: 0;
  pointer-events: none;
}
.back-to-top.visible { opacity: 1; pointer-events: auto; }
.back-to-top:hover { border-color: var(--accent); transform: translateY(-4px); }

/* BANNER */
.material-banner {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--bg2);
  border-top: 2px solid var(--accent);
  padding: 16px 24px;
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
}
.material-banner p { font-size: 13px; color: var(--text2); }
.material-banner strong { color: var(--text); }
.material-banner button {
  white-space: nowrap;
  padding: 8px 16px;
  background: var(--accent);
  color: #000;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

body::before{
  content:'';position:fixed;inset:0;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
  pointer-events:none;z-index:9999;opacity:.8;
}
.mono{font-family:'DM Mono',monospace;}
.serif{font-family:'Fraunces',serif;}

/* NAV */
nav{
  position:fixed;top:0;left:0;right:0;z-index:100;
  display:flex;align-items:center;justify-content:space-between;
  padding:18px 24px;
  background:rgba(8,8,11,0.8);
  backdrop-filter:blur(16px);
  border-bottom:1px solid var(--border);
  transition:all 0.3s var(--ease-out-expo);
}
@media(min-width:768px){nav{padding:18px 48px;}}
.nav-logo{display:flex;align-items:center;gap:10px;}
/* Updated nav-mark to use SVG */
.nav-mark{
  width:28px;height:28px;
  border-radius:6px;
  display:flex;align-items:center;justify-content:center;
  transition:transform 0.3s var(--ease-spring);
  overflow:hidden;
}
.nav-mark:hover{transform:scale(1.05) rotate(-3deg);}
.nav-mark svg{width:100%;height:100%;}
.nav-name{font-family:'Fraunces',serif;font-weight:500;font-size:15px;}
.nav-links{display:none;align-items:center;gap:32px;}
@media(min-width:768px){.nav-links{display:flex;}}
.nav-link{
  font-size:13px;color:var(--text2);text-decoration:none;
  transition:color .15s;cursor:pointer;position:relative;
}
.nav-link::after{
  content:'';position:absolute;bottom:-4px;left:0;width:0;height:1px;
  background:var(--accent);transition:width 0.3s var(--ease-out-expo);
}
.nav-link:hover{color:var(--text);}
.nav-link:hover::after{width:100%;}
.nav-cta{
  padding:8px 20px;background:var(--accent);color:#000;
  border:none;border-radius:6px;font-family:'DM Sans',sans-serif;
  font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;
  position:relative;overflow:hidden;
}
.nav-cta::before{
  content:'';position:absolute;top:0;left:-100%;width:100%;height:100%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent);
  transition:left 0.5s;
}
.nav-cta:hover{background:#00efc0;transform:translateY(-1px);}
.nav-cta:hover::before{left:100%;}
.mobile-menu-btn{
  display:flex;flex-direction:column;gap:4px;background:none;border:none;cursor:pointer;padding:8px;
}
@media(min-width:768px){.mobile-menu-btn{display:none;}}
.mobile-menu-btn span{
  display:block;width:24px;height:2px;background:var(--text);
  transition:all 0.3s var(--ease-out-expo);
}
.mobile-menu-btn.active span:nth-child(1){transform:rotate(45deg) translate(4px,4px);}
.mobile-menu-btn.active span:nth-child(2){opacity:0;}
.mobile-menu-btn.active span:nth-child(3){transform:rotate(-45deg) translate(4px,-4px);}
.mobile-nav{
  position:fixed;top:70px;left:0;right:0;background:var(--bg2);
  border-bottom:1px solid var(--border);padding:24px;
  display:flex;flex-direction:column;gap:16px;
  transform:translateY(-100%);opacity:0;pointer-events:none;
  transition:all 0.4s var(--ease-out-expo);z-index:99;
}
.mobile-nav.active{transform:translateY(0);opacity:1;pointer-events:auto;}

/* SECTIONS */
section{position:relative;}

/* ── HERO ── */
.hero{
  min-height:100vh;
  display:grid;
  grid-template-rows:1fr;
  padding:0 24px;
  padding-top:80px;
  overflow:hidden;
}
@media(min-width:768px){.hero{padding:0 48px;padding-top:80px;}}
.hero-inner{
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  text-align:center;
  padding:60px 0 32px;
  position:relative;z-index:2;
}
@media(min-width:768px){.hero-inner{padding:80px 0 48px;}}
.hero-eyebrow{
  display:inline-flex;align-items:center;gap:8px;
  padding:5px 14px;
  border:1px solid var(--border2);
  border-radius:20px;
  font-family:'DM Mono',monospace;
  font-size:11px;letter-spacing:.08em;
  color:var(--text2);
  margin-bottom:24px;
  background:var(--bg2);
  animation:pulse-border 3s ease-in-out infinite;
}
@media(min-width:768px){.hero-eyebrow{margin-bottom:32px;}}
@keyframes pulse-border{
  0%,100%{border-color:var(--border2);}
  50%{border-color:var(--accent3);}
}
.hero-eyebrow-dot{
  width:6px;height:6px;border-radius:50%;
  background:var(--accent);
  animation:pulse-dot 2s ease-in-out infinite;
}
@keyframes pulse-dot{
  0%,100%{box-shadow:0 0 0 0 rgba(0,212,170,.5);}
  50%{box-shadow:0 0 0 5px rgba(0,212,170,0);}
}
.hero-headline{
  font-family:'Fraunces',serif;
  font-size:clamp(36px,7vw,96px);
  font-weight:700;
  line-height:1.02;
  letter-spacing:-.03em;
  margin-bottom:20px;
  max-width:900px;
}
@media(min-width:768px){.hero-headline{margin-bottom:24px;}}
.hero-headline em{font-style:italic;color:var(--accent);}
.hero-headline .dim{color:var(--text2);}
.hero-sub{
  font-size:16px;color:var(--text2);
  max-width:600px;line-height:1.65;
  margin-bottom:32px;
}
@media(min-width:768px){.hero-sub{font-size:18px;margin-bottom:40px;}}
.hero-sub strong{color:var(--text);font-weight:500;}
.hero-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center;}
.btn-primary{
  padding:12px 24px;
  background:var(--accent);color:#000;
  border:none;border-radius:8px;
  font-family:'DM Sans',sans-serif;
  font-size:14px;font-weight:600;cursor:pointer;
  transition:all .18s var(--ease-spring);display:inline-flex;align-items:center;gap:8px;
}
@media(min-width:768px){.btn-primary{padding:14px 32px;font-size:15px;}}
.btn-primary:hover{background:#00efc0;transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,212,170,.25);}
.btn-ghost{
  padding:11px 20px;background:transparent;
  color:var(--text2);border:1px solid var(--border2);
  border-radius:8px;font-family:'DM Sans',sans-serif;
  font-size:14px;cursor:pointer;transition:all .15s;
}
@media(min-width:768px){.btn-ghost{padding:13px 24px;font-size:15px;}}
.btn-ghost:hover{border-color:rgba(255,255,255,.22);color:var(--text);background:rgba(255,255,255,0.02);}
.hero-social-proof{
  margin-top:20px;
  font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);
  letter-spacing:.06em;
}

/* DASHBOARD PREVIEW */
.dashboard-preview{
  width:100%;max-width:1100px;
  margin:0 auto 0;
  position:relative;
  border-radius:12px 12px 0 0;
  overflow:hidden;
  border:1px solid var(--border2);
  border-bottom:none;
  box-shadow:0 -20px 80px rgba(0,212,170,.06), 0 0 0 1px var(--border);
  transform:translateY(20px);
  opacity:0;
  animation:slideUp 0.8s var(--ease-out-expo) 0.4s forwards;
}
@media(min-width:768px){.dashboard-preview{border-radius:16px 16px 0 0;}}
@keyframes slideUp{
  to{transform:translateY(0);opacity:1;}
}
.preview-topbar{
  background:var(--bg2);
  border-bottom:1px solid var(--border);
  padding:10px 12px;
  display:flex;align-items:center;gap:8px;
}
@media(min-width:768px){.preview-topbar{padding:10px 16px;}}
.preview-dot{width:8px;height:8px;border-radius:50%;}
@media(min-width:768px){.preview-dot{width:10px;height:10px;}}
.preview-title{
  flex:1;text-align:center;
  font-family:'DM Mono',monospace;font-size:10px;color:var(--text3);
}
@media(min-width:768px){.preview-title{font-size:11px;}}
.preview-body{
  display:grid;grid-template-columns:1fr;
  background:var(--bg);
  height:auto;
  overflow:hidden;
}
@media(min-width:768px){.preview-body{grid-template-columns:1fr 240px;height:380px;}}
.preview-main{padding:12px;overflow:hidden;}
@media(min-width:768px){.preview-main{padding:16px;}}
.preview-grid{
  display:grid;grid-template-columns:1fr;gap:8px;
  margin-bottom:12px;
}
@media(min-width:640px){.preview-grid{grid-template-columns:1fr 1fr;}}
.mini-card{
  background:var(--bg2);
  border:1px solid var(--border);
  border-radius:8px;padding:12px;
  position:relative;overflow:hidden;
  transition:all 0.3s var(--ease-out-expo);
}
.mini-card:hover{transform:translateY(-2px);border-color:var(--border2);}
.mini-card.active-card{border-color:rgba(0,212,170,.25);box-shadow:0 0 20px rgba(0,212,170,0.1);}
.mini-card.approval-card{border-color:rgba(245,158,11,.2);}
.mini-dept-bar{height:2px;border-radius:2px;position:absolute;top:0;left:0;right:0;}
.mini-icon{
  width:22px;height:22px;border-radius:5px;
  display:flex;align-items:center;justify-content:center;
  font-size:10px;flex-shrink:0;
}
@media(min-width:768px){.mini-icon{width:24px;height:24px;font-size:11px;}}
.mini-name{font-family:'Fraunces',serif;font-size:11px;font-weight:600;}
@media(min-width:768px){.mini-name{font-size:12px;}}
.mini-status{
  margin-left:auto;display:flex;align-items:center;gap:4px;
  font-family:'DM Mono',monospace;font-size:8px;
}
@media(min-width:768px){.mini-status{font-size:9px;}}
.mini-dot{width:4px;height:4px;border-radius:50%;flex-shrink:0;}
@media(min-width:768px){.mini-dot{width:5px;height:5px;}}
.mini-dot.running{background:var(--accent);animation:pulse-green 1.5s ease-in-out infinite;}
.mini-dot.awaiting{background:var(--amber);animation:pulse-amber 1s ease-in-out infinite;}
.mini-dot.idle{background:var(--text3);}
@keyframes pulse-green{0%,100%{box-shadow:0 0 0 0 rgba(0,212,170,.6);}50%{box-shadow:0 0 0 4px rgba(0,212,170,0);}}
@keyframes pulse-amber{0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,.6);}50%{box-shadow:0 0 0 4px rgba(245,158,11,0);}}
.mini-task{font-size:9px;color:var(--text2);line-height:1.4;}
@media(min-width:768px){.mini-task{font-size:10px;}}
.mini-footer{display:flex;justify-content:space-between;margin-top:8px;}
.mini-model{font-family:'DM Mono',monospace;font-size:8px;color:var(--text3);}
@media(min-width:768px){.mini-model{font-size:9px;}}

/* Mode toggle in preview */
.preview-mode{
  display:flex;align-items:center;gap:6px;
  padding:3px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:12px;
  font-family:'DM Mono',monospace;font-size:8px;
}
@media(min-width:768px){.preview-mode{padding:4px 8px;font-size:9px;}}
.preview-mode-active{
  padding:2px 6px;border-radius:8px;background:var(--accent);color:#000;font-weight:500;
}
@media(min-width:768px){.preview-mode-active{padding:2px 8px;}}

/* Event panel in preview */
.preview-events{
  background:var(--bg2);border-left:none;
  border-top:1px solid var(--border);
  padding:12px;overflow:hidden;display:flex;flex-direction:column;
}
@media(min-width:768px){.preview-events{border-left:1px solid var(--border);border-top:none;padding:12px 10px;}}
.preview-events-title{
  font-family:'DM Mono',monospace;font-size:9px;
  color:var(--text3);letter-spacing:.1em;margin-bottom:10px;
  display:flex;align-items:center;justify-content:space-between;
}
.preview-events-live{color:var(--accent);animation:pulse-text 2s ease-in-out infinite;}
@keyframes pulse-text{0%,100%{opacity:1;}50%{opacity:0.6;}}
.preview-event{
  display:flex;gap:8px;padding:6px 4px;
  border-radius:4px;
  animation:slideEvent .3s ease forwards;
  transition:background 0.2s;
}
.preview-event:hover{background:rgba(255,255,255,0.03);}
@keyframes slideEvent{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:none;}}
.preview-event-dot{width:4px;height:4px;border-radius:50%;flex-shrink:0;margin-top:4px;}
@media(min-width:768px){.preview-event-dot{width:5px;height:5px;}}
.preview-event-text{font-size:9px;color:var(--text2);line-height:1.4;flex:1;}
@media(min-width:768px){.preview-event-text{font-size:10px;}}
.preview-event-time{font-family:'DM Mono',monospace;font-size:8px;color:var(--text3);white-space:nowrap;}
@media(min-width:768px){.preview-event-time{font-size:9px;}}
.preview-approval{
  margin-top:8px;padding:8px;
  background:rgba(245,158,11,.06);
  border:1px solid rgba(245,158,11,.15);
  border-radius:6px;
}
.preview-approval-label{font-size:9px;font-weight:500;margin-bottom:4px;}
@media(min-width:768px){.preview-approval-label{font-size:10px;}}
.preview-approval-btns{display:flex;gap:4px;margin-top:6px;}
.preview-btn{
  padding:3px 6px;border-radius:4px;
  font-family:'DM Mono',monospace;font-size:8px;cursor:pointer;border:none;transition:all 0.2s;
}
@media(min-width:768px){.preview-btn{padding:3px 8px;font-size:9px;}}
.preview-btn.approve{background:rgba(0,212,170,.15);color:var(--accent);}
.preview-btn.approve:hover{background:rgba(0,212,170,.25);}
.preview-btn.reject{background:rgba(255,77,109,.1);color:var(--red);}
.preview-btn.reject:hover{background:rgba(255,77,109,.2);}

/* ── PAIN ── */
.pain{padding:80px 24px;}
@media(min-width:768px){.pain{padding:120px 48px;}}
.pain-inner{max-width:1100px;margin:0 auto;}
.section-label{
  font-family:'DM Mono',monospace;font-size:11px;
  letter-spacing:.12em;color:var(--text3);text-transform:uppercase;
  margin-bottom:20px;
}
.pain-headline{
  font-family:'Fraunces',serif;font-size:clamp(28px,4vw,56px);
  font-weight:700;line-height:1.1;letter-spacing:-.02em;
  margin-bottom:40px;max-width:640px;
}
@media(min-width:768px){.pain-headline{margin-bottom:64px;}}
.pain-headline em{font-style:italic;color:var(--accent);}
.pain-grid{display:grid;grid-template-columns:1fr;gap:16px;}
@media(min-width:768px){.pain-grid{grid-template-columns:repeat(3,1fr);gap:24px;}}
.pain-card{
  padding:24px;
  background:var(--bg2);border:1px solid var(--border);
  border-radius:12px;position:relative;overflow:hidden;
  transition:all 0.4s var(--ease-out-expo);
}
@media(min-width:768px){.pain-card{padding:32px;}}
.pain-card:hover{border-color:var(--border2);transform:translateY(-4px);}
.pain-card::before{
  content:'';position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,var(--border2),transparent);
}
.pain-num{
  font-family:'Fraunces',serif;font-size:56px;font-weight:700;
  color:var(--accent2);
  line-height:1;margin-bottom:12px;letter-spacing:-.04em;
  transition:color 0.4s;
}
@media(min-width:768px){.pain-num{font-size:72px;margin-bottom:16px;}}
.pain-card:hover .pain-num{color:var(--accent);}
.pain-title{font-family:'Fraunces',serif;font-size:18px;font-weight:500;margin-bottom:12px;line-height:1.2;}
@media(min-width:768px){.pain-title{font-size:22px;}}
.pain-body{font-size:13px;color:var(--text2);line-height:1.7;}
@media(min-width:768px){.pain-body{font-size:14px;}}

/* ── FEATURES ── */
.features{padding:60px 24px 80px;}
@media(min-width:768px){.features{padding:80px 48px 120px;}}
.features-inner{max-width:1100px;margin:0 auto;}
.features-headline{
  font-family:'Fraunces',serif;font-size:clamp(28px,4vw,56px);
  font-weight:700;line-height:1.1;letter-spacing:-.02em;
  margin-bottom:40px;
}
@media(min-width:768px){.features-headline{margin-bottom:64px;}}
.features-headline em{font-style:italic;color:var(--accent);}
.feature-block{
  display:grid;grid-template-columns:1fr;gap:32px;
  align-items:center;margin-bottom:60px;
}
@media(min-width:768px){.feature-block{grid-template-columns:1fr 1fr;gap:80px;margin-bottom:100px;}}
.feature-block.reverse{direction:ltr;}
@media(min-width:768px){.feature-block.reverse{direction:rtl;}}
.feature-block.reverse > *{direction:ltr;}
.feature-tag{
  display:inline-block;padding:3px 10px;border-radius:12px;
  background:var(--accent2);color:var(--accent);
  font-family:'DM Mono',monospace;font-size:10px;
  letter-spacing:.06em;margin-bottom:16px;
  border:1px solid var(--accent3);
  transition:all 0.3s;
}
.feature-block:hover .feature-tag{background:var(--accent);color:#000;}
.feature-title{
  font-family:'Fraunces',serif;font-size:clamp(24px,3vw,40px);
  font-weight:600;line-height:1.15;letter-spacing:-.02em;
  margin-bottom:16px;
}
.feature-title em{font-style:italic;color:var(--accent);}
.feature-body{font-size:14px;color:var(--text2);line-height:1.75;margin-bottom:24px;}
@media(min-width:768px){.feature-body{font-size:15px;}}
.feature-detail{
  font-family:'DM Mono',monospace;font-size:10px;color:var(--text3);
  line-height:1.8;
}
@media(min-width:768px){.feature-detail{font-size:11px;}}
.feature-detail span{color:var(--accent);margin-right:6px;}

/* Feature visual panels */
.feature-visual{
  background:var(--bg2);border:1px solid var(--border);
  border-radius:12px;padding:16px;position:relative;overflow:hidden;
  min-height:200px;
  transition:all 0.4s var(--ease-out-expo);
}
@media(min-width:768px){.feature-visual{padding:20px;min-height:240px;}}
.feature-visual:hover{border-color:var(--border2);transform:translateY(-2px);}
.feature-visual::before{
  content:'';position:absolute;top:-60px;right:-60px;
  width:200px;height:200px;
  background:radial-gradient(circle,rgba(0,212,170,.05) 0%,transparent 70%);
  pointer-events:none;
  transition:all 0.6s;
}
.feature-visual:hover::before{transform:scale(1.2);opacity:0.8;}

/* Constitution visual */
.constitution-clause{
  display:flex;gap:10px;padding:6px 0;
  border-bottom:1px solid var(--border);font-size:11px;
  transition:all 0.3s;
}
@media(min-width:768px){.constitution-clause{padding:8px 0;font-size:12px;}}
.constitution-clause:last-child{border-bottom:none;}
.constitution-clause:hover{padding-left:8px;}
.clause-num{color:var(--accent);font-family:'DM Mono',monospace;font-size:10px;flex-shrink:0;width:16px;}
@media(min-width:768px){.clause-num{font-size:11px;}}
.clause-text{color:var(--text2);line-height:1.5;}
.clause-text strong{color:var(--text);}

/* Approval visual */
.approval-visual-item{
  background:var(--bg3);border:1px solid var(--border);
  border-radius:8px;padding:10px;margin-bottom:8px;
  transition:all 0.3s;
}
@media(min-width:768px){.approval-visual-item{padding:12px;}}
.approval-visual-item:hover{border-color:var(--border2);transform:translateX(4px);}
.approval-visual-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.approval-visual-dept{font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);}
@media(min-width:768px){.approval-visual-dept{font-size:10px;}}
.risk-pill{
  padding:2px 6px;border-radius:8px;font-family:'DM Mono',monospace;font-size:8px;
}
@media(min-width:768px){.risk-pill{padding:2px 7px;font-size:9px;}}
.risk-pill.high{background:rgba(255,120,70,.12);color:#ff7846;border:1px solid rgba(255,120,70,.2);}
.risk-pill.critical{background:rgba(255,77,109,.12);color:var(--red);border:1px solid rgba(255,77,109,.2);}
.approval-visual-label{font-size:11px;font-weight:500;margin-bottom:8px;}
@media(min-width:768px){.approval-visual-label{font-size:12px;}}
.approval-visual-btns{display:flex;gap:6px;}
.av-btn{
  padding:3px 10px;border-radius:5px;
  font-family:'DM Mono',monospace;font-size:9px;border:none;cursor:pointer;
  transition:all 0.2s;
}
@media(min-width:768px){.av-btn{padding:4px 12px;font-size:10px;}}
.av-btn.approve{background:rgba(0,212,170,.12);color:var(--accent);border:1px solid rgba(0,212,170,.2);}
.av-btn.approve:hover{background:rgba(0,212,170,.22);}
.av-btn.reject{background:rgba(255,77,109,.08);color:var(--red);border:1px solid rgba(255,77,109,.15);}
.av-btn.reject:hover{background:rgba(255,77,109,.18);}

/* Memo visual */
.memo-visual-item{
  border-left:3px solid;padding:8px 10px;border-radius:0 6px 6px 0;
  margin-bottom:8px;background:var(--bg3);
  transition:all 0.3s;
}
@media(min-width:768px){.memo-visual-item{padding:10px 12px;}}
.memo-visual-item:hover{transform:translateX(4px);}
.memo-visual-item.urgent{border-color:var(--red);}
.memo-visual-item.high{border-color:var(--amber);}
.memo-visual-title{font-size:11px;font-weight:500;margin-bottom:3px;}
@media(min-width:768px){.memo-visual-title{font-size:12px;}}
.memo-visual-body{font-size:10px;color:var(--text2);line-height:1.5;}
@media(min-width:768px){.memo-visual-body{font-size:11px;}}
.memo-visual-from{font-family:'DM Mono',monospace;font-size:8px;color:var(--text3);margin-top:5px;}
@media(min-width:768px){.memo-visual-from{font-size:9px;}}

/* ── HOW IT WORKS ── */
/* ── HOW IT WORKS ── */
.how{padding:80px 24px;border-top:1px solid var(--border);background:var(--bg2);}
@media(min-width:768px){.how{padding:100px 48px;}}
.how-inner{max-width:1100px;margin:0 auto;}
.how-headline{
  font-family:'Fraunces',serif;font-size:clamp(28px,4vw,56px);
  font-weight:700;line-height:1.1;letter-spacing:-.02em;
  margin-bottom:40px;
}
@media(min-width:768px){.how-headline{margin-bottom:64px;}}
.how-headline em{font-style:italic;color:var(--accent);}

.steps{
  display:grid;grid-template-columns:1fr;gap:40px;position:relative;
}
@media(min-width:768px){.steps{grid-template-columns:repeat(2,1fr);}}
@media(min-width:1024px){.steps{grid-template-columns:repeat(5,1fr);gap:24px;}}

.step{
  padding:0;position:relative;z-index:1;
  transition:transform 0.3s var(--ease-spring);
}
.step:hover{transform:translateY(-4px);}

.step-num-wrap{
  width:48px;height:48px;border-radius:50%;
  background:var(--bg3);border:1px solid var(--border2);
  display:flex;align-items:center;justify-content:center;
  margin-bottom:20px;
  font-family:'Fraunces',serif;font-size:18px;font-weight:700;
  color:var(--accent);
  position:relative;
  transition:all 0.4s var(--ease-spring);
}
@media(min-width:768px){.step-num-wrap{width:52px;height:52px;font-size:20px;}}
.step:hover .step-num-wrap{
  background:var(--accent2);border-color:var(--accent);
  box-shadow:0 0 20px rgba(0,212,170,0.15);
}
.step-title{font-family:'Fraunces',serif;font-size:16px;font-weight:600;margin-bottom:12px;line-height:1.3;}
.step-body{font-size:13px;color:var(--text2);line-height:1.65;}

/* ── GLOBAL SECTION ── */
.global-section{padding:60px 24px;border-top:1px solid var(--border);}
@media(min-width:768px){.global-section{padding:80px 48px;}}
.global-inner{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1fr;gap:40px;align-items:center;}
@media(min-width:768px){.global-inner{grid-template-columns:1fr 1fr;gap:80px;}}
.global-headline{
  font-family:'Fraunces',serif;font-size:clamp(26px,3.5vw,48px);
  font-weight:700;line-height:1.1;letter-spacing:-.02em;margin-bottom:20px;
}
.global-headline em{font-style:italic;color:var(--accent);}
.global-body{font-size:14px;color:var(--text2);line-height:1.75;margin-bottom:28px;}
@media(min-width:768px){.global-body{font-size:15px;}}
.global-tags{display:flex;flex-wrap:wrap;gap:8px;}
.global-tag{
  padding:6px 14px;border-radius:20px;
  font-family:'DM Mono',monospace;font-size:11px;color:var(--text2);
  background:var(--bg2);border:1px solid var(--border);
  transition:all 0.3s;cursor:default;
}
.global-tag:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-2px);}
.globe-visual{
  background:var(--bg2);border:1px solid var(--border);
  border-radius:12px;padding:20px;
  display:flex;flex-direction:column;gap:12px;
  transition:all 0.4s;
}
@media(min-width:768px){.globe-visual{padding:28px;}}
.globe-visual:hover{border-color:var(--border2);}
.globe-row{
  display:flex;align-items:center;gap:12px;
  padding:10px 12px;background:var(--bg3);
  border:1px solid var(--border);border-radius:8px;
  transition:all 0.3s;
}
.globe-row:hover{transform:translateX(4px);border-color:var(--border2);}
.globe-flag{font-size:16px;}
@media(min-width:768px){.globe-flag{font-size:18px;}}
.globe-info{flex:1;}
.globe-city{font-size:12px;font-weight:500;}
@media(min-width:768px){.globe-city{font-size:13px;}}
.globe-founder{font-size:10px;color:var(--text2);}
@media(min-width:768px){.globe-founder{font-size:11px;}}
.globe-mode{font-family:'DM Mono',monospace;font-size:9px;color:var(--accent);}
@media(min-width:768px){.globe-mode{font-size:10px;}}

/* ── CTA ── */
.cta-section{
  padding:80px 24px;
  text-align:center;position:relative;overflow:hidden;
}
@media(min-width:768px){.cta-section{padding:120px 48px;}}
.cta-section::before{
  content:'';position:absolute;
  top:50%;left:50%;transform:translate(-50%,-50%);
  width:600px;height:600px;
  background:radial-gradient(circle,rgba(0,212,170,.06) 0%,transparent 70%);
  pointer-events:none;
  animation:pulse-glow 4s ease-in-out infinite;
}
@keyframes pulse-glow{
  0%,100%{transform:translate(-50%,-50%) scale(1);opacity:0.6;}
  50%{transform:translate(-50%,-50%) scale(1.1);opacity:1;}
}
.cta-eyebrow{
  font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.12em;
  color:var(--text3);text-transform:uppercase;margin-bottom:20px;
}
.cta-headline{
  font-family:'Fraunces',serif;font-size:clamp(32px,5vw,72px);
  font-weight:700;line-height:1.05;letter-spacing:-.03em;
  margin-bottom:20px;max-width:700px;margin-left:auto;margin-right:auto;
}
@media(min-width:768px){.cta-headline{margin-bottom:20px;}}
.cta-headline em{font-style:italic;color:var(--accent);}
.cta-sub{
  font-size:15px;color:var(--text2);max-width:480px;
  margin:0 auto 32px;line-height:1.65;
}
@media(min-width:768px){.cta-sub{font-size:17px;margin-bottom:40px;}}
.email-form{
  display:flex;flex-direction:column;gap:8px;max-width:440px;margin:0 auto 16px;
}
@media(min-width:640px){.email-form{flex-direction:row;gap:8px;}}
.email-input{
  flex:1;padding:13px 16px;
  background:var(--bg2);border:1px solid var(--border2);
  border-radius:8px;color:var(--text);
  font-family:'DM Sans',sans-serif;font-size:14px;outline:none;
  transition:border-color .2s,box-shadow .2s;
}
.email-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,212,170,.08);}
.email-input::placeholder{color:var(--text3);}
.cta-note{font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);}
.cta-count{
  display:inline-flex;align-items:center;gap:8px;
  margin-top:32px;padding:8px 16px;
  border:1px solid var(--border);border-radius:20px;
  background:var(--bg2);
  font-family:'DM Mono',monospace;font-size:11px;color:var(--text2);
  transition:all 0.3s;
}
.cta-count:hover{border-color:var(--accent);}
.count-dot{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse-dot 2s infinite;}
.count-num{color:var(--accent);font-weight:600;}

/* ── FOOTER ── */
footer{
  padding:32px 24px;border-top:1px solid var(--border);
  display:flex;flex-direction:column;align-items:center;gap:16px;
}
@media(min-width:768px){
  footer{
    padding:40px 48px;
    flex-direction:row;align-items:center;justify-content:space-between;
  }
}
.footer-logo{display:flex;align-items:center;gap:8px;}
/* Updated footer-mark to use SVG */
.footer-mark{
  width:22px;height:22px;
  border-radius:5px;
  display:flex;align-items:center;justify-content:center;
  transition:transform 0.3s var(--ease-spring);
  overflow:hidden;
}
.footer-mark:hover{transform:rotate(-10deg) scale(1.1);}
.footer-mark svg{width:100%;height:100%;}
.footer-name{font-family:'Fraunces',serif;font-size:13px;font-weight:500;}
.footer-copy{font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);}
.footer-links{display:flex;gap:20px;}
.footer-link{font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);text-decoration:none;cursor:pointer;transition:color .15s;position:relative;}
.footer-link::after{content:'';position:absolute;bottom:-2px;left:0;width:0;height:1px;background:var(--accent);transition:width 0.3s;}
.footer-link:hover{color:var(--text2);}
.footer-link:hover::after{width:100%;}

/* Toast */
.toast{
  position:fixed;bottom:24px;right:24px;z-index:200;
  background:var(--bg2);border:1px solid var(--accent3);
  border-left:3px solid var(--accent);
  border-radius:8px;padding:14px 18px;
  font-size:13px;color:var(--text);
  box-shadow:0 8px 32px rgba(0,0,0,.4);
  animation:toastIn .3s ease;
  max-width:300px;
}
@media(max-width:640px){.toast{left:24px;right:24px;bottom:16px;}}
@keyframes toastIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}

/* ── PRICING STYLES ── */
.pricing-container {
  max-width: 1080px;
  margin: 0 auto;
  padding: 120px 24px 80px;
}
.pricing-header { text-align: center; margin-bottom: 60px; }
.pricing-title { font-family: 'Fraunces', serif; font-size: clamp(32px, 5vw, 56px); font-weight: 700; margin-bottom: 16px; letter-spacing: -0.02em; }
.pricing-subtitle { color: var(--text2); font-size: 18px; max-width: 600px; margin: 0 auto 12px; }
.pricing-note { color: var(--text3); font-size: 14px; }

.billing-toggle-wrap { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 40px; }
.billing-toggle { background: var(--bg2); border: 1px solid var(--border); border-radius: 50px; padding: 4px; display: flex; position: relative; width: 320px; }
.billing-btn { 
  flex: 1; padding: 10px 0; border-radius: 40px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.3s; 
  background: transparent; border: none; color: var(--text2); position: relative; z-index: 1; text-align: center;
}
.billing-btn.active { color: var(--text); }
.billing-toggle-bg { 
  position: absolute; top: 4px; left: 4px; width: calc(50% - 4px); height: calc(100% - 8px); 
  background: var(--bg3); border: 1px solid var(--border2); border-radius: 40px; transition: transform 0.3s var(--ease-out-expo);
}
.billing-save-badge { background: var(--accent); color: var(--bg); font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; margin-left: 2px; }


.founding-banner {
  background: rgba(29, 158, 117, 0.06); border: 1px solid #1D9E75; border-radius: 12px; padding: 20px 24px;
  display: flex; flex-direction: column; gap: 16px; margin-bottom: 40px; text-align: left;
}
@media(min-width:768px){ .founding-banner { flex-direction: row; align-items: center; justify-content: space-between; } }
.founding-banner-left { display: flex; align-items: center; gap: 12px; }
.founding-banner-lock { color: #1D9E75; font-size: 20px; }
.founding-banner-title { font-weight: 600; color: #1D9E75; font-size: 15px; }
.founding-banner-spots { font-family: 'DM Mono', monospace; font-size: 11px; background: rgba(29, 158, 117, 0.15); padding: 2px 8px; border-radius: 4px; }
.founding-banner-right { text-align: left; }
@media(min-width:768px){ .founding-banner-right { text-align: right; } }
.founding-banner-main { font-weight: 500; color: var(--text); }
.founding-banner-sub { font-size: 13px; color: var(--text2); }

.limits-block {
  background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); border-radius: 12px;
  padding: 16px; margin-bottom: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
}
.limit-item { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text2); display: flex; align-items: center; gap: 6px; }
.limit-icon { color: #EF9F27; font-size: 14px; }

.pricing-card.highlight-pulse {
  animation: cardPulse 2s infinite;
}
@keyframes cardPulse {
  0% { box-shadow: 0 0 0 0 rgba(29, 158, 117, 0.4); }
  70% { box-shadow: 0 0 0 15px rgba(29, 158, 117, 0); }
  100% { box-shadow: 0 0 0 0 rgba(29, 158, 117, 0); }
}

.pricing-grid { display: grid; grid-template-columns: 1fr; gap: 24px; margin-bottom: 80px; }
@media(min-width:1024px){ .pricing-grid { grid-template-columns: repeat(3, 1fr); align-items: start; } }
.pricing-card {
  background: var(--bg2); border: 1px solid var(--border); border-radius: 20px; padding: 32px;
  display: flex; flex-direction: column; height: 100%; transition: transform 0.3s ease, border-color 0.3s ease;
}
.pricing-card.pro { border-color: #1D9E75; box-shadow: 0 24px 48px rgba(29, 158, 117, 0.06); transform: scale(1.02); z-index: 2; }
.pricing-card.team { opacity: 0.8; }
.card-badge { align-self: center; background: #1D9E75; color: white; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 20px; transform: translateY(-16px); margin-bottom: -8px; }

.card-label { font-family: 'DM Mono', monospace; font-size: 13px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
.card-price-wrap { margin-bottom: 24px; min-height: 80px; }
.card-price { display: flex; align-items: baseline; gap: 4px; font-family: 'Fraunces', serif; }
.price-val { font-size: 40px; font-weight: 700; }
.price-sec { color: var(--text3); font-size: 16px; margin-left: 2px; }
.price-ngn { color: var(--text3); font-size: 13px; margin-top: 4px; }
.price-founding { color: #1D9E75; margin-top: 4px; font-size: 12px; font-weight: 500; }
.price-strike { text-decoration: line-through; color: var(--text3); font-size: 18px; margin-right: 8px; }

.card-tagline { font-size: 15px; color: var(--text2); line-height: 1.5; margin-bottom: 32px; flex-grow: 1; }
.card-features { list-style: none; margin-bottom: 32px; }
.feature-item { 
  display: flex; gap: 10px; font-size: 14px; margin-bottom: 12px; 
  color: var(--text2); align-items: flex-start; 
}
.feature-item.no { color: var(--text3); }
.feature-check { color: #1D9E75; font-weight: bold; flex-shrink: 0; }
.feature-no { color: var(--text3); flex-shrink: 0; }

.pricing-btn {
  width: 100%; padding: 14px; border-radius: 12px; font-weight: 600; font-size: 15px; 
  cursor: pointer; transition: all 0.3s; border: none; margin-bottom: 12px;
}
.pricing-btn.primary { background: #1D9E75; color: white; }
.pricing-btn.primary:hover { background: #188a66; transform: translateY(-2px); }
.pricing-btn.outline { background: transparent; border: 1px solid var(--border2); color: var(--text); }
.pricing-btn.outline:hover { background: var(--border); }
.card-subtext { text-align: center; font-size: 11px; color: var(--text3); }

/* Comparison Table */
.comparison-wrap { overflow-x: auto; margin-bottom: 80px; border: 1px solid var(--border); border-radius: 20px; background: var(--bg2); }
.comp-table { width: 100%; border-collapse: collapse; min-width: 600px; text-align: left; }
.comp-table th, .comp-table td { padding: 16px 24px; border-bottom: 1px solid var(--border); }
.comp-table th { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text3); text-transform: uppercase; }
.comp-table tr.group-header { background: var(--bg); }
.comp-table tr.group-header td { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; color: var(--text); padding-top: 24px; border-bottom: none; }
.feature-label { font-size: 14px; color: var(--text); }
.feature-val { font-size: 14px; color: var(--text2); text-align: center; }
.feature-val.check { color: #1D9E75; font-weight: bold; }
.feature-val.coming { color: var(--amber); }

/* FAQ */
.faq-section { max-width: 800px; margin: 0 auto 80px; }
.faq-item { border-bottom: 1px solid var(--border); }
.faq-q { 
  width: 100%; padding: 24px 0; display: flex; justify-content: space-between; align-items: center; 
  background: transparent; border: none; color: var(--text); font-family: 'Fraunces', serif;
  font-size: 18px; font-weight: 600; cursor: pointer; text-align: left;
}
.faq-chevron { transition: transform 0.3s; color: var(--text3); }
.faq-item.open .faq-chevron { transform: rotate(180deg); }
.faq-a { max-height: 0; overflow: hidden; transition: all 0.3s ease-in-out; color: var(--text2); font-size: 15px; line-height: 1.7; }
.faq-item.open .faq-a { max-height: 500px; padding-bottom: 24px; }

/* Final CTA */
.pricing-cta {
  background: var(--bg2); border: 1px solid var(--border); border-radius: 24px; padding: 60px 24px;
  text-align: center; position: relative; overflow: hidden;
}
.pricing-cta-title { font-family: 'Fraunces', serif; font-size: clamp(28px, 4vw, 44px); font-weight: 700; margin-bottom: 16px; }
.pricing-cta-btns { display: flex; flex-direction: column; gap: 12px; max-width: 400px; margin: 32px auto 0; }
@media(min-width:640px){ .pricing-cta-btns { flex-direction: row; } }


/* Scroll animations */
.reveal{
  opacity:0;transform:translateY(30px);
  transition:all 0.8s var(--ease-out-expo);
}
.reveal.active{opacity:1;transform:translateY(0);}
.reveal-left{opacity:0;transform:translateX(-30px);transition:all 0.8s var(--ease-out-expo);}
.reveal-left.active{opacity:1;transform:translateX(0);}
.reveal-right{opacity:0;transform:translateX(30px);transition:all 0.8s var(--ease-out-expo);}
.reveal-right.active{opacity:1;transform:translateX(0);}
.reveal-scale{opacity:0;transform:scale(0.95);transition:all 0.8s var(--ease-out-expo);}
.reveal-scale.active{opacity:1;transform:scale(1);}

/* Stagger delays */
.delay-1{transition-delay:0.1s;}
.delay-2{transition-delay:0.2s;}
.delay-3{transition-delay:0.3s;}
.delay-4{transition-delay:0.4s;}

/* Scrollbar */
::-webkit-scrollbar{width:4px;}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px;}
::-webkit-scrollbar-track{background:transparent;}

/* 404 PAGE STYLES */
.not-found-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg);
  padding: 24px;
  animation: fadeIn 0.6s var(--ease-out-expo);
}
.not-found-content { text-align: center; max-width: 600px; }
.not-found-title { font-family: 'Fraunces', serif; font-size: clamp(64px, 10vw, 120px); font-weight: 800; color: var(--accent); margin: 0; line-height: 1; opacity: 0.8; }
.not-found-subtitle { font-family: 'Fraunces', serif; font-size: clamp(28px, 5vw, 48px); font-weight: 700; color: var(--text); margin: 16px 0 24px; letter-spacing: -0.02em; }
.not-found-description { font-size: 16px; color: var(--text2); margin-bottom: 40px; line-height: 1.6; }
.not-found-actions { display: flex; flex-direction: column; gap: 24px; align-items: center; }
.not-found-links { display: flex; gap: 24px; justify-content: center; flex-wrap: wrap; }
.not-found-links a { color: var(--text2); text-decoration: none; font-size: 14px; transition: color 0.3s ease; }
.not-found-links a:hover { color: var(--accent); }

`
