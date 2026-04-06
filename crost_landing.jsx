import { useState, useEffect, useRef } from "react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,700;0,9..144,800;1,9..144,300;1,9..144,400;1,9..144,700&family=DM+Mono:wght@300;400;500&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');`;

const CSS = `
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
  padding:18px 48px;
  background:rgba(8,8,11,0.8);
  backdrop-filter:blur(16px);
  border-bottom:1px solid var(--border);
}
.nav-logo{display:flex;align-items:center;gap:10px;}
.nav-mark{
  width:28px;height:28px;background:var(--accent);
  border-radius:6px;display:flex;align-items:center;justify-content:center;
  font-family:'Fraunces',serif;font-weight:700;font-size:13px;color:#000;
}
.nav-name{font-family:'Fraunces',serif;font-weight:500;font-size:15px;}
.nav-links{display:flex;align-items:center;gap:32px;}
.nav-link{
  font-size:13px;color:var(--text2);text-decoration:none;
  transition:color .15s;cursor:pointer;
}
.nav-link:hover{color:var(--text);}
.nav-cta{
  padding:8px 20px;background:var(--accent);color:#000;
  border:none;border-radius:6px;font-family:'DM Sans',sans-serif;
  font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;
}
.nav-cta:hover{background:#00efc0;transform:translateY(-1px);}

/* SECTIONS */
section{position:relative;}

/* ── HERO ── */
.hero{
  min-height:100vh;
  display:grid;
  grid-template-rows:1fr;
  padding:0 48px;
  padding-top:80px;
  overflow:hidden;
}
.hero-inner{
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  text-align:center;
  padding:80px 0 48px;
  position:relative;z-index:2;
}
.hero-eyebrow{
  display:inline-flex;align-items:center;gap:8px;
  padding:5px 14px;
  border:1px solid var(--border2);
  border-radius:20px;
  font-family:'DM Mono',monospace;
  font-size:11px;letter-spacing:.08em;
  color:var(--text2);
  margin-bottom:32px;
  background:var(--bg2);
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
  font-size:clamp(52px,7vw,96px);
  font-weight:700;
  line-height:1.02;
  letter-spacing:-.03em;
  margin-bottom:24px;
  max-width:900px;
}
.hero-headline em{font-style:italic;color:var(--accent);}
.hero-headline .dim{color:var(--text2);}
.hero-sub{
  font-size:18px;color:var(--text2);
  max-width:520px;line-height:1.65;
  margin-bottom:40px;
}
.hero-sub strong{color:var(--text);font-weight:500;}
.hero-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center;}
.btn-primary{
  padding:14px 32px;
  background:var(--accent);color:#000;
  border:none;border-radius:8px;
  font-family:'DM Sans',sans-serif;
  font-size:15px;font-weight:600;cursor:pointer;
  transition:all .18s;display:inline-flex;align-items:center;gap:8px;
}
.btn-primary:hover{background:#00efc0;transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,212,170,.25);}
.btn-ghost{
  padding:13px 24px;background:transparent;
  color:var(--text2);border:1px solid var(--border2);
  border-radius:8px;font-family:'DM Sans',sans-serif;
  font-size:15px;cursor:pointer;transition:all .15s;
}
.btn-ghost:hover{border-color:rgba(255,255,255,.22);color:var(--text);}
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
  border-radius:16px 16px 0 0;
  overflow:hidden;
  border:1px solid var(--border2);
  border-bottom:none;
  box-shadow:0 -20px 80px rgba(0,212,170,.06), 0 0 0 1px var(--border);
}
.preview-topbar{
  background:var(--bg2);
  border-bottom:1px solid var(--border);
  padding:10px 16px;
  display:flex;align-items:center;gap:8px;
}
.preview-dot{width:10px;height:10px;border-radius:50%;}
.preview-title{
  flex:1;text-align:center;
  font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);
}
.preview-body{
  display:grid;grid-template-columns:1fr 240px;
  background:var(--bg);
  height:380px;
  overflow:hidden;
}
.preview-main{padding:16px;overflow:hidden;}
.preview-grid{
  display:grid;grid-template-columns:1fr 1fr;gap:8px;
  margin-bottom:12px;
}
.mini-card{
  background:var(--bg2);
  border:1px solid var(--border);
  border-radius:8px;padding:12px;
  position:relative;overflow:hidden;
  transition:border-color .3s;
}
.mini-card.active-card{border-color:rgba(0,212,170,.25);}
.mini-card.approval-card{border-color:rgba(245,158,11,.2);}
.mini-card-top{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
.mini-dept-bar{height:2px;border-radius:2px;position:absolute;top:0;left:0;right:0;}
.mini-icon{
  width:24px;height:24px;border-radius:5px;
  display:flex;align-items:center;justify-content:center;
  font-size:11px;flex-shrink:0;
}
.mini-name{font-family:'Fraunces',serif;font-size:12px;font-weight:600;}
.mini-status{
  margin-left:auto;display:flex;align-items:center;gap:4px;
  font-family:'DM Mono',monospace;font-size:9px;
}
.mini-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;}
.mini-dot.running{background:var(--accent);animation:pulse-green 1.5s ease-in-out infinite;}
.mini-dot.awaiting{background:var(--amber);animation:pulse-amber 1s ease-in-out infinite;}
.mini-dot.idle{background:var(--text3);}
@keyframes pulse-green{0%,100%{box-shadow:0 0 0 0 rgba(0,212,170,.6);}50%{box-shadow:0 0 0 4px rgba(0,212,170,0);}}
@keyframes pulse-amber{0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,.6);}50%{box-shadow:0 0 0 4px rgba(245,158,11,0);}}
.mini-task{font-size:10px;color:var(--text2);line-height:1.4;}
.mini-footer{display:flex;justify-content:space-between;margin-top:8px;}
.mini-model{font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);}

/* Mode toggle in preview */
.preview-mode{
  display:flex;align-items:center;gap:6px;
  padding:4px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:12px;
  font-family:'DM Mono',monospace;font-size:9px;
}
.preview-mode-active{
  padding:2px 8px;border-radius:8px;background:var(--accent);color:#000;font-weight:500;
}

/* Event panel in preview */
.preview-events{
  background:var(--bg2);border-left:1px solid var(--border);
  padding:12px 10px;overflow:hidden;display:flex;flex-direction:column;
}
.preview-events-title{
  font-family:'DM Mono',monospace;font-size:9px;
  color:var(--text3);letter-spacing:.1em;margin-bottom:10px;
  display:flex;align-items:center;justify-content:space-between;
}
.preview-events-live{color:var(--accent);}
.preview-event{
  display:flex;gap:8px;padding:6px 4px;
  border-radius:4px;
  animation:slideEvent .3s ease forwards;
}
@keyframes slideEvent{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:none;}}
.preview-event-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;margin-top:4px;}
.preview-event-text{font-size:10px;color:var(--text2);line-height:1.4;flex:1;}
.preview-event-time{font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);white-space:nowrap;}
.preview-approval{
  margin-top:8px;padding:8px;
  background:rgba(245,158,11,.06);
  border:1px solid rgba(245,158,11,.15);
  border-radius:6px;
}
.preview-approval-label{font-size:10px;font-weight:500;margin-bottom:4px;}
.preview-approval-btns{display:flex;gap:4px;margin-top:6px;}
.preview-btn{
  padding:3px 8px;border-radius:4px;
  font-family:'DM Mono',monospace;font-size:9px;cursor:pointer;border:none;
}
.preview-btn.approve{background:rgba(0,212,170,.15);color:var(--accent);}
.preview-btn.reject{background:rgba(255,77,109,.1);color:var(--red);}

/* ── PAIN ── */
.pain{padding:120px 48px;}
.pain-inner{max-width:1100px;margin:0 auto;}
.section-label{
  font-family:'DM Mono',monospace;font-size:11px;
  letter-spacing:.12em;color:var(--text3);text-transform:uppercase;
  margin-bottom:20px;
}
.pain-headline{
  font-family:'Fraunces',serif;font-size:clamp(36px,4vw,56px);
  font-weight:700;line-height:1.1;letter-spacing:-.02em;
  margin-bottom:64px;max-width:640px;
}
.pain-headline em{font-style:italic;color:var(--accent);}
.pain-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;}
.pain-card{
  padding:32px;
  background:var(--bg2);border:1px solid var(--border);
  border-radius:12px;position:relative;overflow:hidden;
}
.pain-card::before{
  content:'';position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,var(--border2),transparent);
}
.pain-num{
  font-family:'Fraunces',serif;font-size:72px;font-weight:700;
  color:var(--bg3);line-height:1;margin-bottom:16px;letter-spacing:-.04em;
}
.pain-title{font-family:'Fraunces',serif;font-size:22px;font-weight:500;margin-bottom:12px;line-height:1.2;}
.pain-body{font-size:14px;color:var(--text2);line-height:1.7;}

/* ── FEATURES ── */
.features{padding:80px 48px 120px;}
.features-inner{max-width:1100px;margin:0 auto;}
.features-headline{
  font-family:'Fraunces',serif;font-size:clamp(36px,4vw,56px);
  font-weight:700;line-height:1.1;letter-spacing:-.02em;
  margin-bottom:64px;
}
.features-headline em{font-style:italic;color:var(--accent);}
.feature-block{
  display:grid;grid-template-columns:1fr 1fr;gap:80px;
  align-items:center;margin-bottom:100px;
}
.feature-block.reverse{direction:rtl;}
.feature-block.reverse > *{direction:ltr;}
.feature-text{}
.feature-tag{
  display:inline-block;padding:3px 10px;border-radius:12px;
  background:var(--accent2);color:var(--accent);
  font-family:'DM Mono',monospace;font-size:10px;
  letter-spacing:.06em;margin-bottom:16px;
  border:1px solid var(--accent3);
}
.feature-title{
  font-family:'Fraunces',serif;font-size:clamp(28px,3vw,40px);
  font-weight:600;line-height:1.15;letter-spacing:-.02em;
  margin-bottom:16px;
}
.feature-title em{font-style:italic;color:var(--accent);}
.feature-body{font-size:15px;color:var(--text2);line-height:1.75;margin-bottom:24px;}
.feature-detail{
  font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);
  line-height:1.8;
}
.feature-detail span{color:var(--accent);margin-right:6px;}

/* Feature visual panels */
.feature-visual{
  background:var(--bg2);border:1px solid var(--border);
  border-radius:12px;padding:20px;position:relative;overflow:hidden;
  min-height:240px;
}
.feature-visual::before{
  content:'';position:absolute;top:-60px;right:-60px;
  width:200px;height:200px;
  background:radial-gradient(circle,rgba(0,212,170,.05) 0%,transparent 70%);
  pointer-events:none;
}

/* Constitution visual */
.constitution-clause{
  display:flex;gap:10px;padding:8px 0;
  border-bottom:1px solid var(--border);font-size:12px;
}
.constitution-clause:last-child{border-bottom:none;}
.clause-num{color:var(--accent);font-family:'DM Mono',monospace;font-size:11px;flex-shrink:0;width:16px;}
.clause-text{color:var(--text2);line-height:1.5;}
.clause-text strong{color:var(--text);}

/* Approval visual */
.approval-visual-item{
  background:var(--bg3);border:1px solid var(--border);
  border-radius:8px;padding:12px;margin-bottom:8px;
}
.approval-visual-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.approval-visual-dept{font-family:'DM Mono',monospace;font-size:10px;color:var(--text3);}
.risk-pill{
  padding:2px 7px;border-radius:8px;font-family:'DM Mono',monospace;font-size:9px;
}
.risk-pill.high{background:rgba(255,120,70,.12);color:#ff7846;border:1px solid rgba(255,120,70,.2);}
.risk-pill.critical{background:rgba(255,77,109,.12);color:var(--red);border:1px solid rgba(255,77,109,.2);}
.approval-visual-label{font-size:12px;font-weight:500;margin-bottom:8px;}
.approval-visual-btns{display:flex;gap:6px;}
.av-btn{
  padding:4px 12px;border-radius:5px;
  font-family:'DM Mono',monospace;font-size:10px;border:none;cursor:pointer;
}
.av-btn.approve{background:rgba(0,212,170,.12);color:var(--accent);border:1px solid rgba(0,212,170,.2);}
.av-btn.reject{background:rgba(255,77,109,.08);color:var(--red);border:1px solid rgba(255,77,109,.15);}

/* Memo visual */
.memo-visual-item{
  border-left:3px solid;padding:10px 12px;border-radius:0 6px 6px 0;
  margin-bottom:8px;background:var(--bg3);
}
.memo-visual-item.urgent{border-color:var(--red);}
.memo-visual-item.high{border-color:var(--amber);}
.memo-visual-title{font-size:12px;font-weight:500;margin-bottom:3px;}
.memo-visual-body{font-size:11px;color:var(--text2);line-height:1.5;}
.memo-visual-from{font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);margin-top:5px;}

/* ── HOW IT WORKS ── */
.how{padding:80px 48px 120px;overflow:hidden;}
.how-inner{max-width:1100px;margin:0 auto;}
.how-headline{
  font-family:'Fraunces',serif;font-size:clamp(36px,4vw,56px);
  font-weight:700;line-height:1.1;letter-spacing:-.02em;
  margin-bottom:56px;
}
.how-headline em{font-style:italic;color:var(--accent);}
.steps{display:grid;grid-template-columns:repeat(5,1fr);gap:0;position:relative;}
.steps::before{
  content:'';position:absolute;
  top:28px;left:10%;right:10%;height:1px;
  background:linear-gradient(90deg,transparent,var(--border2),var(--border2),transparent);
}
.step{padding:0 16px;position:relative;z-index:1;}
.step-num-wrap{
  width:56px;height:56px;border-radius:50%;
  background:var(--bg2);border:1px solid var(--border2);
  display:flex;align-items:center;justify-content:center;
  margin-bottom:20px;
  font-family:'Fraunces',serif;font-size:22px;font-weight:700;
  color:var(--text2);
  position:relative;
}
.step:first-child .step-num-wrap,
.step.active-step .step-num-wrap{
  background:var(--accent2);border-color:var(--accent);color:var(--accent);
}
.step-title{font-family:'Fraunces',serif;font-size:16px;font-weight:600;margin-bottom:8px;line-height:1.3;}
.step-body{font-size:13px;color:var(--text2);line-height:1.6;}

/* ── GLOBAL SECTION ── */
.global-section{padding:80px 48px;border-top:1px solid var(--border);}
.global-inner{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center;}
.global-headline{
  font-family:'Fraunces',serif;font-size:clamp(32px,3.5vw,48px);
  font-weight:700;line-height:1.1;letter-spacing:-.02em;margin-bottom:20px;
}
.global-headline em{font-style:italic;color:var(--accent);}
.global-body{font-size:15px;color:var(--text2);line-height:1.75;margin-bottom:28px;}
.global-tags{display:flex;flex-wrap:wrap;gap:8px;}
.global-tag{
  padding:6px 14px;border-radius:20px;
  font-family:'DM Mono',monospace;font-size:11px;color:var(--text2);
  background:var(--bg2);border:1px solid var(--border);
}
.globe-visual{
  background:var(--bg2);border:1px solid var(--border);
  border-radius:12px;padding:28px;
  display:flex;flex-direction:column;gap:12px;
}
.globe-row{
  display:flex;align-items:center;gap:12px;
  padding:10px 12px;background:var(--bg3);
  border:1px solid var(--border);border-radius:8px;
}
.globe-flag{font-size:18px;}
.globe-info{flex:1;}
.globe-city{font-size:13px;font-weight:500;}
.globe-founder{font-size:11px;color:var(--text2);}
.globe-mode{font-family:'DM Mono',monospace;font-size:10px;color:var(--accent);}

/* ── CTA ── */
.cta-section{
  padding:120px 48px;
  text-align:center;position:relative;overflow:hidden;
}
.cta-section::before{
  content:'';position:absolute;
  top:50%;left:50%;transform:translate(-50%,-50%);
  width:600px;height:600px;
  background:radial-gradient(circle,rgba(0,212,170,.06) 0%,transparent 70%);
  pointer-events:none;
}
.cta-eyebrow{
  font-family:'DM Mono',monospace;font-size:11px;letter-spacing:.12em;
  color:var(--text3);text-transform:uppercase;margin-bottom:20px;
}
.cta-headline{
  font-family:'Fraunces',serif;font-size:clamp(40px,5vw,72px);
  font-weight:700;line-height:1.05;letter-spacing:-.03em;
  margin-bottom:20px;max-width:700px;margin-left:auto;margin-right:auto;
}
.cta-headline em{font-style:italic;color:var(--accent);}
.cta-sub{
  font-size:17px;color:var(--text2);max-width:480px;
  margin:0 auto 40px;line-height:1.65;
}
.email-form{
  display:flex;gap:8px;max-width:440px;margin:0 auto 16px;
}
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
}
.count-dot{width:6px;height:6px;border-radius:50%;background:var(--accent);}
.count-num{color:var(--accent);}

/* ── FOOTER ── */
footer{
  padding:40px 48px;border-top:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;
}
.footer-logo{display:flex;align-items:center;gap:8px;}
.footer-mark{
  width:22px;height:22px;background:var(--accent);border-radius:5px;
  display:flex;align-items:center;justify-content:center;
  font-family:'Fraunces',serif;font-weight:700;font-size:10px;color:#000;
}
.footer-name{font-family:'Fraunces',serif;font-size:13px;font-weight:500;}
.footer-copy{font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);}
.footer-links{display:flex;gap:20px;}
.footer-link{font-family:'DM Mono',monospace;font-size:11px;color:var(--text3);text-decoration:none;cursor:pointer;transition:color .15s;}
.footer-link:hover{color:var(--text2);}

/* Animations */
@keyframes fadeUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:none;}}
.fade-up{animation:fadeUp .6s ease forwards;}
.fade-up-1{animation-delay:.1s;opacity:0;}
.fade-up-2{animation-delay:.2s;opacity:0;}
.fade-up-3{animation-delay:.35s;opacity:0;}
.fade-up-4{animation-delay:.5s;opacity:0;}

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
@keyframes toastIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}

::-webkit-scrollbar{width:4px;}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px;}
`;

// ─── MINI DASHBOARD DATA ───────────────────────────────────────────────────────

const DEPTS = [
  { name: "Engineering", icon: "🛠", color: "#0ea5e9", status: "running", task: "Reviewing PR #47 — payment webhook refactor", model: "local/llama3" },
  { name: "Marketing", icon: "📣", color: "#f97316", status: "awaiting", task: "Approval pending: LinkedIn thread on BNPL", model: "local/gemma3" },
  { name: "Sales", icon: "🤝", color: "#22c55e", status: "idle", task: "No active task", model: "cloud/gemini-pro" },
  { name: "Finance", icon: "📊", color: "#a855f7", status: "running", task: "Updating runway model — 7.2 months", model: "local/gemma3" },
];

const EVENTS_SEED = [
  { dept: "Engineering", text: "PR #47 review started — 847 lines changed", color: "#0ea5e9", time: "just now" },
  { dept: "Marketing", text: "Approval requested: Post LinkedIn thread", color: "#f97316", time: "2m ago" },
  { dept: "Finance", text: "Runway model updated: 7.2 months", color: "#a855f7", time: "8m ago" },
  { dept: "Sales", text: "Research complete: 8 investor leads found", color: "#22c55e", time: "14m ago" },
  { dept: "system", text: "Mode switched: cloud → local", color: "#64748b", time: "31m ago" },
];

const LIVE_EVENTS = [
  { dept: "Engineering", text: "Token usage: 1,240 tokens this session", color: "#0ea5e9" },
  { dept: "Finance", text: "Memo written: Runway at 7 months", color: "#a855f7" },
  { dept: "Sales", text: "Apollo search: 3 new contacts found", color: "#22c55e" },
  { dept: "Operations", text: "Contract draft: 2 clauses flagged", color: "#64748b" },
];

// ─── MINI DASHBOARD COMPONENT ─────────────────────────────────────────────────

function MiniDashboard() {
  const [events, setEvents] = useState(EVENTS_SEED);
  const [newId, setNewId] = useState(null);
  let idx = 0;

  useEffect(() => {
    const t = setInterval(() => {
      const e = { ...LIVE_EVENTS[idx % LIVE_EVENTS.length], time: "just now", id: Date.now() };
      setNewId(e.id);
      setEvents(prev => [e, ...prev.slice(0, 7)]);
      idx++;
    }, 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="dashboard-preview">
      <div className="preview-topbar">
        <div className="preview-dot" style={{ background: "#ff5f57" }} />
        <div className="preview-dot" style={{ background: "#febc2e" }} />
        <div className="preview-dot" style={{ background: "#28c840" }} />
        <div className="preview-title mono">crost — Agent Office</div>
        <div className="preview-mode">
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: "var(--text3)" }}>MODE</span>
          <span className="preview-mode-active">LOCAL</span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: "var(--text3)" }}>CLOUD</span>
        </div>
      </div>
      <div className="preview-body">
        <div className="preview-main">
          <div className="preview-grid">
            {DEPTS.map(d => (
              <div key={d.name} className={`mini-card ${d.status === "running" ? "active-card" : d.status === "awaiting" ? "approval-card" : ""}`}>
                <div className="mini-dept-bar" style={{ background: d.color }} />
                <div className="mini-card-top">
                  <div className="mini-icon" style={{ background: d.color + "22" }}>{d.icon}</div>
                  <div className="mini-name serif">{d.name}</div>
                  <div className="mini-status mono">
                    <div className={`mini-dot ${d.status}`} />
                    {d.status === "awaiting" ? "WAIT" : d.status.toUpperCase()}
                  </div>
                </div>
                <div className="mini-task" style={{ color: d.status === "idle" ? "var(--text3)" : "var(--text2)", fontStyle: d.status === "idle" ? "italic" : "normal" }}>
                  {d.task}
                </div>
                <div className="mini-footer">
                  <div className="mini-model">{d.model}</div>
                </div>
              </div>
            ))}
          </div>
          {/* Mini approval */}
          <div className="preview-approval">
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: "var(--text3)", marginBottom: 3 }}>PENDING APPROVAL</div>
            <div className="preview-approval-label">Post LinkedIn thread on BNPL for SMEs</div>
            <div style={{ fontSize: 10, color: "var(--text2)" }}>Marketing · <span style={{ color: "var(--amber)" }}>medium risk</span></div>
            <div className="preview-approval-btns">
              <button className="preview-btn approve">✓ Approve</button>
              <button className="preview-btn reject">✗ Reject</button>
            </div>
          </div>
        </div>
        {/* Event panel */}
        <div className="preview-events">
          <div className="preview-events-title">
            <span>LIVE EVENTS</span>
            <span className="preview-events-live">● LIVE</span>
          </div>
          {events.slice(0, 8).map((e, i) => (
            <div key={e.id || i} className="preview-event" style={{ animationDelay: i === 0 && e.id === newId ? "0ms" : "none" }}>
              <div className="preview-event-dot" style={{ background: e.color }} />
              <div className="preview-event-text">{e.text}</div>
              <div className="preview-event-time">{e.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function CrostLanding() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState(null);
  const [count] = useState(847);

  const handleSubmit = () => {
    if (!email.includes("@")) return;
    setSubmitted(true);
    setToast("You're on the list. We'll be in touch.");
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <>
      <style>{FONTS}{CSS}</style>

      {/* NAV */}
      <nav>
        <div className="nav-logo">
          <div className="nav-mark">C</div>
          <span className="nav-name">Crost</span>
        </div>
        <div className="nav-links">
          <span className="nav-link" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>Product</span>
          <span className="nav-link" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>How it works</span>
          <span className="nav-link" onClick={() => document.getElementById('global')?.scrollIntoView({ behavior: 'smooth' })}>Global</span>
          <button className="nav-cta" onClick={() => document.getElementById('cta')?.scrollIntoView({ behavior: 'smooth' })}>
            Get Early Access
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-eyebrow fade-up fade-up-1">
            <div className="hero-eyebrow-dot" />
            <span className="mono">Agentic OS for Solo Founders</span>
          </div>

          <h1 className="hero-headline fade-up fade-up-2">
            Your AI office.<br />
            <em>Open for business.</em>
          </h1>

          <p className="hero-sub fade-up fade-up-3">
            Five departments. One dashboard. <strong>Nothing ships without your sign-off.</strong> Crost runs your company while you run your company.
          </p>

          <div className="hero-actions fade-up fade-up-4">
            <button className="btn-primary" onClick={() => document.getElementById('cta')?.scrollIntoView({ behavior: 'smooth' })}>
              Get Early Access →
            </button>
            <button className="btn-ghost" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>
              See how it works
            </button>
          </div>
          <div className="hero-social-proof mono fade-up fade-up-4" style={{ animationDelay: '.65s', opacity: 0 }}>
            {count.toLocaleString()} founders on the waitlist
          </div>
        </div>

        <MiniDashboard />
      </section>

      {/* PAIN */}
      <section className="pain">
        <div className="pain-inner">
          <div className="section-label mono">The Reality</div>
          <h2 className="pain-headline serif">
            You're doing the work<br />of <em>five people.</em>
          </h2>
          <div className="pain-grid">
            {[
              { num: "01", title: "You're the engineer, the marketer, the salesperson.", body: "Every solo founder wears every hat. The work is real. The bandwidth isn't. You drop things. Important things." },
              { num: "02", title: "AI tools help, but they don't remember, coordinate, or act.", body: "You've tried the chatbots. They're powerful for a prompt, then gone. Nothing carries context. Nothing talks to anything else." },
              { num: "03", title: "You can't hire yet. But you needed a team yesterday.", body: "You're pre-revenue or early-stage. A full team isn't an option. But operating alone at full speed isn't sustainable either." },
            ].map(p => (
              <div key={p.num} className="pain-card">
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
          <div className="section-label mono">The Product</div>
          <h2 className="features-headline serif">
            Not a chatbot.<br />An <em>operating system.</em>
          </h2>

          {/* Feature 1: Constitution */}
          <div className="feature-block">
            <div className="feature-text">
              <div className="feature-tag mono">CONTROL</div>
              <h3 className="feature-title serif">Agents with <em>rules.</em><br />Not guesses.</h3>
              <p className="feature-body">Every department runs on the Crost Constitution — eight non-negotiable rules that govern agent behaviour, always. Agents never send, merge, or spend without your explicit sign-off. This is not a toggle. It is structural.</p>
              <div className="feature-detail mono">
                <div><span>→</span> Approval Feed for all irreversible actions</div>
                <div><span>→</span> Risk levels: low / medium / high / critical</div>
                <div><span>→</span> Constitution inspired by Anthropic's safety architecture</div>
              </div>
            </div>
            <div className="feature-visual">
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--text3)", letterSpacing: ".1em", marginBottom: 14 }}>AGENT CONSTITUTION</div>
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
                <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--accent)" }}>Founders can add clauses. Core rules cannot be removed.</div>
              </div>
            </div>
          </div>

          {/* Feature 2: Approvals */}
          <div className="feature-block reverse">
            <div className="feature-text">
              <div className="feature-tag mono">OVERSIGHT</div>
              <h3 className="feature-title serif">Your sign-off.<br /><em>Every time.</em></h3>
              <p className="feature-body">When an agent wants to act — send that email, merge that PR, post that content — it stops and waits. You see exactly what it wants to do and why. One click approves. One click rejects. You're always in control.</p>
              <div className="feature-detail mono">
                <div><span>→</span> Pending approvals expire after 24 hours</div>
                <div><span>→</span> Full payload preview before you decide</div>
                <div><span>→</span> Rejection reason fed back to the agent</div>
              </div>
            </div>
            <div className="feature-visual">
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--text3)", letterSpacing: ".1em", marginBottom: 12 }}>APPROVAL FEED</div>
              {[
                { dept: "Marketing", label: "Post LinkedIn thread on BNPL for SMEs", risk: "medium", riskClass: "high" },
                { dept: "Engineering", label: "Merge PR #47 — payment webhook refactor", risk: "critical", riskClass: "critical" },
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
            <div className="feature-text">
              <div className="feature-tag mono">COORDINATION</div>
              <h3 className="feature-title serif">Departments that<br /><em>talk to each other.</em></h3>
              <p className="feature-body">When Marketing promises a feature, Engineering knows before it starts coding. When Finance flags a budget constraint, Sales stops quoting numbers that don't exist. The memo system is your company's shared memory — written by agents, read by agents, always current.</p>
              <div className="feature-detail mono">
                <div><span>→</span> Agents write memos after significant tasks</div>
                <div><span>→</span> Every agent reads the memo brief before starting</div>
                <div><span>→</span> Priority levels: low / normal / high / urgent</div>
              </div>
            </div>
            <div className="feature-visual">
              <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: "var(--text3)", letterSpacing: ".1em", marginBottom: 12 }}>COMPANY MEMOS</div>
              {[
                { priority: "urgent", title: "Runway at 7 months — review burn rate", body: "Limit discretionary spend. Growth must accelerate.", from: "Finance" },
                { priority: "high", title: "Payment webhook ships Friday", body: "Do not promise payment features before then.", from: "Engineering" },
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
      <section className="how" id="how" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="how-inner">
          <div className="section-label mono">How It Works</div>
          <h2 className="how-headline serif">
            Up and running<br />in <em>under 10 minutes.</em>
          </h2>
          <div className="steps">
            {[
              { n: "1", title: "System check", body: "Crost scans your machine. Ollama detected, RAM measured, GPU checked. You see exactly what mode you can run.", active: true },
              { n: "2", title: "Set your identity", body: "Tell Crost where you're building and who you're building for. It reflects your context back, calibrated for your market." },
              { n: "3", title: "Choose your style", body: "Careful, balanced, or aggressive. Sets how often your team asks for approval. Matches how you actually operate." },
              { n: "4", title: "Pick your team", body: "Select 2–3 departments. They activate immediately — not from a blank slate. They arrive ready." },
              { n: "5", title: "Give the first goal", body: "Type your first objective. Crost distributes it. Your dashboard opens alive — tasks in motion, first approval waiting." },
            ].map(s => (
              <div key={s.n} className={`step ${s.active ? "active-step" : ""}`}>
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
          <div>
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
          <div className="globe-visual">
            {[
              { flag: "🇳🇬", city: "Lagos, Nigeria", founder: "B2B credit for informal retail", mode: "LOCAL · gemma3:12b" },
              { flag: "🇮🇩", city: "Jakarta, Indonesia", founder: "SME logistics marketplace", mode: "LOCAL · gemma3:12b" },
              { flag: "🇧🇷", city: "São Paulo, Brazil", founder: "Embedded finance for merchants", mode: "CLOUD · gemini-pro" },
              { flag: "🇰🇪", city: "Nairobi, Kenya", founder: "AgriTech platform for farmers", mode: "LOCAL · llama3:8b" },
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
        <div className="cta-eyebrow mono">Early Access</div>
        <h2 className="cta-headline serif">
          Your office is<br /><em>waiting for you.</em>
        </h2>
        <p className="cta-sub">
          Join the waitlist. We're onboarding founders in batches — technical and non-technical, early-stage and scaling.
        </p>

        {!submitted ? (
          <>
            <div className="email-form">
              <input
                className="email-input"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
              />
              <button className="btn-primary" onClick={handleSubmit}>
                Get Access
              </button>
            </div>
            <div className="cta-note mono">No credit card. No commitment. Ship in minutes.</div>
          </>
        ) : (
          <div style={{ padding: "20px 32px", background: "var(--accent2)", border: "1px solid var(--accent3)", borderRadius: 10, display: "inline-block", marginBottom: 16 }}>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, marginBottom: 4 }}>You're on the list. ✓</div>
            <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "var(--text2)" }}>We'll reach out before your batch opens.</div>
          </div>
        )}

        <div>
          <div className="cta-count">
            <div className="count-dot" />
            <span><span className="count-num">{count.toLocaleString()}</span> founders waiting</span>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-logo">
          <div className="footer-mark">C</div>
          <span className="footer-name">Crost</span>
        </div>
        <div className="footer-copy mono">© 2026 Crost. All rights reserved.</div>
        <div className="footer-links">
          {["Privacy", "Terms", "Contact"].map(l => (
            <span key={l} className="footer-link">{l}</span>
          ))}
        </div>
      </footer>

      {/* TOAST */}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
