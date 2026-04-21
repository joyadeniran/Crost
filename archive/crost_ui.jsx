import { useState, useEffect, useRef } from "react";

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500&display=swap');
`;

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #09090b;
    --bg-2: #111114;
    --bg-3: #18181c;
    --bg-4: #1f1f25;
    --border: rgba(255,255,255,0.07);
    --border-bright: rgba(255,255,255,0.13);
    --text: #e8e8f0;
    --text-2: #9898aa;
    --text-3: #5a5a6e;
    --accent: #00d4aa;
    --accent-dim: rgba(0,212,170,0.12);
    --accent-glow: rgba(0,212,170,0.25);
    --red: #ff4d6d;
    --amber: #ffb347;
    --blue: #4da6ff;
    --green: #00d4aa;
    --radius: 10px;
    --radius-sm: 6px;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    line-height: 1.5;
    overflow: hidden;
    height: 100vh;
  }

  .mono { font-family: 'DM Mono', monospace; }
  .syne { font-family: 'Syne', sans-serif; }

  /* Grain overlay */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
    pointer-events: none;
    z-index: 9999;
    opacity: 0.6;
  }

  /* Layout */
  .shell { display: flex; height: 100vh; }
  .sidebar { width: 220px; min-width: 220px; background: var(--bg-2); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .topbar { height: 56px; min-height: 56px; border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 20px; gap: 12px; background: var(--bg-2); }
  .content { flex: 1; overflow-y: auto; padding: 20px; display: flex; gap: 16px; }
  .event-panel { width: 260px; min-width: 260px; }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius: 2px; }

  /* Sidebar */
  .sidebar-logo { padding: 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .logo-mark { width: 28px; height: 28px; background: var(--accent); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-family: 'Syne', sans-serif; font-weight: 800; font-size: 13px; color: #000; flex-shrink: 0; }
  .logo-text { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 15px; letter-spacing: 0.02em; }
  .sidebar-nav { flex: 1; padding: 10px 8px; display: flex; flex-direction: column; gap: 2px; }
  .nav-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--radius-sm); color: var(--text-2); font-size: 13px; cursor: pointer; transition: all 0.15s; user-select: none; }
  .nav-item:hover { background: var(--bg-3); color: var(--text); }
  .nav-item.active { background: var(--accent-dim); color: var(--accent); }
  .nav-item svg { flex-shrink: 0; }
  .nav-section { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--text-3); letter-spacing: 0.12em; text-transform: uppercase; padding: 14px 10px 6px; }
  .sidebar-bottom { padding: 12px 8px; border-top: 1px solid var(--border); }

  /* Topbar */
  .topbar-left { display: flex; align-items: center; gap: 8px; flex: 1; }
  .topbar-title { font-family: 'Syne', sans-serif; font-weight: 600; font-size: 14px; }
  .topbar-right { display: flex; align-items: center; gap: 10px; }
  
  /* Mode toggle */
  .mode-toggle { display: flex; align-items: center; background: var(--bg-3); border: 1px solid var(--border); border-radius: 20px; padding: 3px; gap: 2px; }
  .mode-btn { padding: 4px 12px; border-radius: 16px; font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500; letter-spacing: 0.05em; cursor: pointer; transition: all 0.2s; border: none; outline: none; }
  .mode-btn.local.active { background: #00d4aa; color: #000; }
  .mode-btn.cloud.active { background: #4da6ff; color: #000; }
  .mode-btn:not(.active) { background: transparent; color: var(--text-3); }
  .mode-label { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text-3); margin-right: 4px; }

  /* Icon button */
  .icon-btn { width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-3); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-2); transition: all 0.15s; position: relative; }
  .icon-btn:hover { border-color: var(--border-bright); color: var(--text); }
  .badge { position: absolute; top: -4px; right: -4px; width: 16px; height: 16px; background: var(--red); border-radius: 8px; font-size: 9px; font-family: 'DM Mono', monospace; display: flex; align-items: center; justify-content: center; color: #fff; border: 2px solid var(--bg-2); }

  /* Department grid */
  .dept-grid { flex: 1; }
  .grid-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .grid-title { font-family: 'Syne', sans-serif; font-weight: 600; font-size: 13px; color: var(--text-2); letter-spacing: 0.04em; }
  .dept-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }

  /* Department card */
  .dept-card { background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden; }
  .dept-card:hover { border-color: var(--border-bright); background: var(--bg-3); }
  .dept-card.active-card:hover { border-color: rgba(0,212,170,0.3); }
  .dept-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; border-radius: var(--radius) var(--radius) 0 0; }

  .dept-card-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
  .dept-icon-wrap { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .dept-status-area { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }

  .dept-name { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 15px; margin-bottom: 2px; }
  .dept-task { font-size: 12px; color: var(--text-2); line-height: 1.4; min-height: 34px; }
  .dept-task.empty { color: var(--text-3); font-style: italic; }

  .dept-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
  .dept-model { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--text-3); }
  .dept-tokens { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--text-3); display: flex; align-items: center; gap: 6px; }
  .token-bar-wrap { width: 48px; height: 3px; background: var(--bg-4); border-radius: 2px; }
  .token-bar { height: 100%; border-radius: 2px; transition: width 0.3s; }

  /* Status badges */
  .status-badge { display: flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 10px; font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.04em; }
  .status-badge.idle { background: rgba(255,255,255,0.05); color: var(--text-3); }
  .status-badge.running { background: rgba(0,212,170,0.12); color: var(--accent); }
  .status-badge.awaiting { background: rgba(255,179,71,0.12); color: var(--amber); }
  .status-badge.error { background: rgba(255,77,109,0.12); color: var(--red); }

  .activation-badge { padding: 2px 7px; border-radius: 8px; font-family: 'DM Mono', monospace; font-size: 9px; font-weight: 500; letter-spacing: 0.06em; }
  .activation-badge.active { background: rgba(0,212,170,0.1); color: var(--accent); border: 1px solid rgba(0,212,170,0.2); }
  .activation-badge.draft { background: rgba(255,179,71,0.1); color: var(--amber); border: 1px solid rgba(255,179,71,0.2); }
  .activation-badge.review { background: rgba(77,166,255,0.1); color: var(--blue); border: 1px solid rgba(77,166,255,0.2); }

  /* Pulse dot */
  .pulse-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .pulse-dot.idle { background: var(--text-3); }
  .pulse-dot.running { background: var(--accent); animation: pulse-green 1.5s ease-in-out infinite; }
  .pulse-dot.awaiting { background: var(--amber); animation: pulse-amber 1s ease-in-out infinite; }
  .pulse-dot.error { background: var(--red); }

  @keyframes pulse-green {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0,212,170,0.6); }
    50% { box-shadow: 0 0 0 5px rgba(0,212,170,0); }
  }
  @keyframes pulse-amber {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255,179,71,0.6); }
    50% { box-shadow: 0 0 0 5px rgba(255,179,71,0); }
  }

  /* Add department card */
  .add-dept-card { background: transparent; border: 1px dashed var(--border); border-radius: var(--radius); padding: 16px; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 148px; }
  .add-dept-card:hover { border-color: var(--accent); background: var(--accent-dim); }
  .add-dept-card:hover .add-dept-label { color: var(--accent); }
  .add-dept-label { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text-3); letter-spacing: 0.06em; transition: color 0.2s; }

  /* Event panel */
  .panel { background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; height: 100%; display: flex; flex-direction: column; }
  .panel-header { padding: 12px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .panel-title { font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 600; color: var(--text-2); letter-spacing: 0.04em; }
  .panel-body { flex: 1; overflow-y: auto; padding: 6px; }

  /* Event items */
  .event-item { padding: 8px 8px; border-radius: var(--radius-sm); display: flex; gap: 10px; transition: background 0.15s; }
  .event-item:hover { background: var(--bg-3); }
  .event-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
  .event-content { flex: 1; min-width: 0; }
  .event-desc { font-size: 12px; color: var(--text-2); line-height: 1.4; }
  .event-meta { font-family: 'DM Mono', monospace; font-size: 10px; color: var(--text-3); margin-top: 2px; display: flex; gap: 8px; }
  .event-dept { color: var(--text-3); }

  /* Approval panel items */
  .approval-item { padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); margin-bottom: 8px; }
  .approval-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .approval-label { font-size: 12px; font-weight: 500; line-height: 1.3; margin-bottom: 4px; }
  .approval-context { font-size: 11px; color: var(--text-2); line-height: 1.4; }
  .approval-actions { display: flex; gap: 6px; margin-top: 10px; }
  .btn { padding: 5px 12px; border-radius: var(--radius-sm); font-size: 12px; cursor: pointer; border: none; font-family: 'DM Mono', monospace; font-weight: 500; transition: all 0.15s; }
  .btn-approve { background: rgba(0,212,170,0.15); color: var(--accent); border: 1px solid rgba(0,212,170,0.3); }
  .btn-approve:hover { background: rgba(0,212,170,0.25); }
  .btn-reject { background: rgba(255,77,109,0.1); color: var(--red); border: 1px solid rgba(255,77,109,0.2); }
  .btn-reject:hover { background: rgba(255,77,109,0.2); }

  .risk-badge { padding: 2px 7px; border-radius: 8px; font-family: 'DM Mono', monospace; font-size: 9px; font-weight: 500; letter-spacing: 0.05em; }
  .risk-badge.critical { background: rgba(255,77,109,0.15); color: var(--red); border: 1px solid rgba(255,77,109,0.25); }
  .risk-badge.high { background: rgba(255,120,70,0.15); color: #ff7846; border: 1px solid rgba(255,120,70,0.25); }
  .risk-badge.medium { background: rgba(255,179,71,0.15); color: var(--amber); border: 1px solid rgba(255,179,71,0.25); }
  .risk-badge.low { background: rgba(0,212,170,0.1); color: var(--accent); border: 1px solid rgba(0,212,170,0.2); }

  /* View tabs */
  .view-tabs { display: flex; gap: 2px; background: var(--bg-3); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
  .view-tab { padding: 4px 12px; border-radius: 5px; font-family: 'DM Mono', monospace; font-size: 11px; cursor: pointer; transition: all 0.15s; color: var(--text-3); border: none; background: transparent; }
  .view-tab.active { background: var(--bg-4); color: var(--text); }

  /* New dept button */
  .btn-primary { padding: 6px 14px; border-radius: var(--radius-sm); background: var(--accent); color: #000; font-family: 'DM Mono', monospace; font-size: 11px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; display: flex; align-items: center; gap: 6px; letter-spacing: 0.03em; }
  .btn-primary:hover { background: #00efc0; }

  /* Modal overlay */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; }
  .modal { background: var(--bg-2); border: 1px solid var(--border-bright); border-radius: 14px; width: 540px; max-height: 80vh; overflow-y: auto; }
  .modal-header { padding: 20px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  .modal-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 16px; }
  .modal-body { padding: 24px; }
  .modal-footer { padding: 16px 24px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }

  /* Form elements */
  .field { margin-bottom: 18px; }
  .label { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text-2); margin-bottom: 6px; display: block; letter-spacing: 0.04em; }
  .input { width: 100%; padding: 8px 12px; background: var(--bg-3); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 13px; outline: none; transition: border-color 0.15s; }
  .input:focus { border-color: var(--accent); }
  .textarea { width: 100%; padding: 10px 12px; background: var(--bg-3); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font-family: 'DM Mono', monospace; font-size: 12px; outline: none; transition: border-color 0.15s; resize: vertical; min-height: 100px; line-height: 1.6; }
  .textarea:focus { border-color: var(--accent); }

  .wizard-steps { display: flex; gap: 4px; margin-bottom: 24px; }
  .wizard-step { flex: 1; height: 3px; border-radius: 2px; background: var(--border); transition: background 0.3s; }
  .wizard-step.done { background: var(--accent); }
  .wizard-step.current { background: var(--accent); opacity: 0.5; }

  .tool-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 16px; font-family: 'DM Mono', monospace; font-size: 11px; cursor: pointer; border: 1px solid var(--border); background: var(--bg-3); color: var(--text-2); transition: all 0.15s; margin: 3px; }
  .tool-chip.selected { border-color: var(--accent); background: var(--accent-dim); color: var(--accent); }
  .tool-chip:hover:not(.selected) { border-color: var(--border-bright); color: var(--text); }

  /* Memo cards */
  .memo-item { padding: 12px; border-radius: var(--radius-sm); border-left: 3px solid; margin-bottom: 8px; background: var(--bg-3); }
  .memo-item.urgent { border-color: var(--red); }
  .memo-item.high { border-color: var(--amber); }
  .memo-item.normal { border-color: var(--text-3); }
  .memo-title { font-weight: 500; font-size: 12px; margin-bottom: 4px; }
  .memo-body { font-size: 11px; color: var(--text-2); line-height: 1.5; }
  .memo-meta { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  .memo-tag { padding: 1px 7px; border-radius: 8px; font-family: 'DM Mono', monospace; font-size: 9px; background: var(--bg-4); color: var(--text-3); }
  .memo-from { font-family: 'DM Mono', monospace; font-size: 9px; color: var(--text-3); }

  /* Fade in */
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .fade-in { animation: fadeIn 0.3s ease forwards; }

  /* Slide in new event */
  @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }
  .slide-in { animation: slideDown 0.25s ease forwards; }

  .divider { height: 1px; background: var(--border); margin: 8px 0; }
  .flex { display: flex; }
  .items-center { align-items: center; }
  .gap-2 { gap: 8px; }
  .ml-auto { margin-left: auto; }
  .text-accent { color: var(--accent); }
  .text-muted { color: var(--text-3); }

  /* Constitution panel */
  .constitution-text { font-family: 'DM Mono', monospace; font-size: 11px; color: var(--text-2); line-height: 1.8; background: var(--bg-3); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; }
  .constitution-clause { display: flex; gap: 8px; margin-bottom: 6px; }
  .clause-num { color: var(--accent); flex-shrink: 0; }
`;

// ─── ICONS ───────────────────────────────────────────────────────────────────

const Icon = ({ name, size = 14, color = "currentColor" }) => {
  const icons = {
    grid: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
    bell: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="1.5" viewBox="0 0 24 24"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>,
    check: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="2" viewBox="0 0 24 24"><polyline points="20,6 9,17 4,12"/></svg>,
    x: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    plus: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    settings: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
    approvals: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="1.5" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>,
    memos: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="1.5" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>,
    code: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="1.5" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
    megaphone: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="1.5" viewBox="0 0 24 24"><path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>,
    handshake: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="1.5" viewBox="0 0 24 24"><path d="M17 11l-5-5-5 5m5-5v12"/><path d="M3 7l4 4m10-4l-4 4"/></svg>,
    chart: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="1.5" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    ops: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
    activity: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="1.5" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    shield: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    eye: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="1.5" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    user: <svg width={size} height={size} fill="none" stroke={color} strokeWidth="1.5" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  };
  return icons[name] || null;
};

// ─── DATA ────────────────────────────────────────────────────────────────────

const DEPARTMENTS = [
  { id: 1, name: "Engineering", slug: "engineering", icon: "code", color: "#0ea5e9", stage: "active", status: "running", task: "Reviewing PR #47 — refactoring the payment webhook handler for idempotency", model: "local/llama3", tokens: 0.62 },
  { id: 2, name: "Marketing", slug: "marketing", icon: "megaphone", color: "#f97316", stage: "active", status: "awaiting", task: "Awaiting approval to post LinkedIn thread on BNPL for SMEs", model: "local/gemma3", tokens: 0.31 },
  { id: 3, name: "Sales", slug: "sales", icon: "handshake", color: "#22c55e", stage: "active", status: "idle", task: null, model: "cloud/gemini-pro", tokens: 0.08 },
  { id: 4, name: "Finance", slug: "finance", icon: "chart", color: "#a855f7", stage: "active", status: "idle", task: null, model: "local/gemma3", tokens: 0.15 },
  { id: 5, name: "Operations", slug: "operations", icon: "ops", color: "#64748b", stage: "active", status: "running", task: "Drafting employment contract for new contractor", model: "local/gemma3", tokens: 0.44 },
  { id: 6, name: "Legal Research", slug: "legal", icon: "shield", color: "#f59e0b", stage: "draft", status: "idle", task: null, model: "local/gemma3", tokens: 0 },
];

const APPROVALS = [
  { id: 1, dept: "Marketing", risk: "medium", action: "Post LinkedIn thread", context: "Drafted a 6-part thread on BNPL adoption for SMEs. Estimated reach: 3,200 impressions.", payload: "Thread preview: '1/ Most small businesses don't have a CFO...'" },
  { id: 2, dept: "Sales", risk: "high", action: "Send cold outreach to 8 investors", context: "Identified 8 pre-seed VCs focused on Africa fintech from Apollo research.", payload: "To: partner@vc.com, Subject: Crost — Agentic OS for Founders" },
  { id: 3, dept: "Engineering", risk: "critical", action: "Merge PR #47 to main", context: "Refactor complete. Tests passing. Ready for production.", payload: "Branch: feat/payment-webhook-idempotency → main" },
];

const MEMOS = [
  { from: "Engineering", priority: "high", title: "Payment webhook refactor ships Friday", body: "PR #47 will merge Friday. Marketing should not promise any payment-related features before then.", tags: ["promise", "deadline"] },
  { from: "Finance", priority: "urgent", title: "Runway at 7 months — review burn rate", body: "Current MRR growth needs to accelerate. Limit discretionary spend this month.", tags: ["budget", "urgent"] },
  { from: "Sales", priority: "normal", title: "8 investor leads identified from Apollo", body: "Tier 1: Partech, TLcom, Norrsken22. Awaiting approval to send first touch.", tags: ["investors", "outreach"] },
];

const EVENTS_INITIAL = [
  { id: 1, type: "task_started", dept: "Engineering", desc: "Reviewing PR #47 — payment webhook refactor", time: "just now", color: "#0ea5e9" },
  { id: 2, type: "approval_requested", dept: "Marketing", desc: "Approval requested: Post LinkedIn thread", time: "2m ago", color: "#f97316" },
  { id: 3, type: "memo_written", dept: "Finance", desc: "Memo written: Runway at 7 months", time: "8m ago", color: "#a855f7" },
  { id: 4, type: "task_completed", dept: "Sales", desc: "Research complete: 8 investor leads identified", time: "14m ago", color: "#22c55e" },
  { id: 5, type: "mode_switched", dept: "system", desc: "Mode switched: cloud → local", time: "31m ago", color: "#64748b" },
  { id: 6, type: "task_started", dept: "Operations", desc: "Drafting employment contract for new contractor", time: "35m ago", color: "#64748b" },
  { id: 7, type: "approval_approved", dept: "system", desc: "Approved: Send follow-up email to Partech", time: "1h ago", color: "#00d4aa" },
];

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

const PulseDot = ({ status }) => (
  <span className={`pulse-dot ${status === "awaiting_approval" ? "awaiting" : status}`} />
);

const StatusBadge = ({ status }) => {
  const labels = { idle: "IDLE", running: "RUNNING", awaiting_approval: "APPROVAL", error: "ERROR" };
  const cls = status === "awaiting_approval" ? "awaiting" : status;
  return (
    <span className={`status-badge ${cls}`}>
      <PulseDot status={status} />
      {labels[status] || status.toUpperCase()}
    </span>
  );
};

const ActivationBadge = ({ stage }) => (
  <span className={`activation-badge ${stage}`}>{stage.toUpperCase()}</span>
);

const DepartmentCard = ({ dept, onClick }) => {
  const tokenPct = Math.round(dept.tokens * 100);
  const tokenColor = dept.tokens > 0.8 ? "#ff4d6d" : dept.tokens > 0.6 ? "#ffb347" : "#00d4aa";

  return (
    <div
      className={`dept-card ${dept.status === "running" || dept.status === "awaiting_approval" ? "active-card" : ""}`}
      style={{ "--card-color": dept.color, borderTopColor: dept.color }}
      onClick={() => onClick(dept)}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: dept.color, borderRadius: "10px 10px 0 0" }} />

      <div className="dept-card-header">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="dept-icon-wrap" style={{ background: dept.color + "22" }}>
            <Icon name={dept.icon} size={16} color={dept.color} />
          </div>
          <div>
            <div className="dept-name syne">{dept.name}</div>
          </div>
        </div>
        <div className="dept-status-area">
          <StatusBadge status={dept.status} />
          {dept.stage !== "active" && <ActivationBadge stage={dept.stage} />}
        </div>
      </div>

      <div className={`dept-task ${!dept.task ? "empty" : ""}`}>
        {dept.task || "No active task"}
      </div>

      <div className="dept-footer">
        <span className="dept-model mono">{dept.model}</span>
        <div className="dept-tokens">
          <div className="token-bar-wrap">
            <div className="token-bar" style={{ width: `${tokenPct}%`, background: tokenColor }} />
          </div>
          <span>{tokenPct}%</span>
        </div>
      </div>
    </div>
  );
};

const AddDeptCard = ({ onClick }) => (
  <div className="add-dept-card" onClick={onClick}>
    <div style={{ width: 32, height: 32, borderRadius: 8, border: "1px dashed rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Icon name="plus" size={16} color="rgba(255,255,255,0.3)" />
    </div>
    <span className="add-dept-label mono">NEW DEPARTMENT</span>
  </div>
);

const EventItem = ({ event, isNew }) => (
  <div className={`event-item ${isNew ? "slide-in" : ""}`}>
    <div className="event-dot" style={{ background: event.color }} />
    <div className="event-content">
      <div className="event-desc">{event.desc}</div>
      <div className="event-meta">
        <span className="mono">{event.time}</span>
        {event.dept !== "system" && <span className="event-dept mono">{event.dept}</span>}
      </div>
    </div>
  </div>
);

const ApprovalItem = ({ item, onApprove, onReject }) => (
  <div className="approval-item fade-in">
    <div className="approval-header">
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--text-3)" }}>{item.dept}</span>
      <span className={`risk-badge ${item.risk}`}>{item.risk.toUpperCase()}</span>
    </div>
    <div className="approval-label">{item.action}</div>
    <div className="approval-context">{item.context}</div>
    <div style={{ marginTop: 8, padding: "6px 8px", background: "var(--bg-4)", borderRadius: 4, fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--text-3)", lineHeight: 1.5 }}>
      {item.payload}
    </div>
    <div className="approval-actions">
      <button className="btn btn-approve" onClick={() => onApprove(item.id)}>
        ✓ Approve
      </button>
      <button className="btn btn-reject" onClick={() => onReject(item.id)}>
        ✗ Reject
      </button>
    </div>
  </div>
);

const MemoItem = ({ memo }) => (
  <div className={`memo-item ${memo.priority}`}>
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
      <div className="memo-title">{memo.title}</div>
    </div>
    <div className="memo-body">{memo.body}</div>
    <div className="memo-meta">
      <span className="memo-from mono">from {memo.from}</span>
      {memo.tags.map(t => <span key={t} className="memo-tag">{t}</span>)}
    </div>
  </div>
);

const ConstitutionViewer = () => {
  const clauses = [
    "NEVER take an irreversible action without calling request_approval() first.",
    "NEVER fabricate data, metrics, quotes, or facts.",
    "NEVER expose credentials, API keys, or sensitive data.",
    "NEVER make commitments on behalf of the founder without approval.",
    "ALWAYS check company_memos before starting a task.",
    "ALWAYS surface uncertainty rather than guessing.",
    "ALWAYS log task start, completion, and errors.",
    "You are a department head. The founder is the CEO.",
  ];
  return (
    <div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--text-3)", marginBottom: 10, letterSpacing: "0.08em" }}>
        CROST AGENT CONSTITUTION — applies to all departments
      </div>
      <div className="constitution-text">
        {clauses.map((c, i) => (
          <div key={i} className="constitution-clause">
            <span className="clause-num">{i + 1}.</span>
            <span>{c}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--text-3)" }}>
        Core clauses are read-only. Contact Crost to propose amendments.
      </div>
    </div>
  );
};

// Wizard step components
const WizardStep1 = ({ data, onChange }) => (
  <div>
    <div className="field">
      <label className="label">DEPARTMENT NAME</label>
      <input className="input" placeholder="e.g. Customer Success" value={data.name} onChange={e => onChange({ ...data, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') })} />
    </div>
    <div className="field">
      <label className="label">SLUG (auto-generated)</label>
      <input className="input mono" style={{ color: "var(--accent)", fontSize: 12 }} value={data.slug} readOnly />
    </div>
    <div className="field">
      <label className="label">ACCENT COLOR</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["#0ea5e9","#f97316","#22c55e","#a855f7","#f59e0b","#ec4899","#06b6d4","#64748b"].map(c => (
          <div key={c} onClick={() => onChange({ ...data, color: c })} style={{ width: 28, height: 28, borderRadius: 6, background: c, cursor: "pointer", border: data.color === c ? "2px solid white" : "2px solid transparent", transition: "all 0.15s" }} />
        ))}
      </div>
    </div>
  </div>
);

const WizardStep2 = ({ data, onChange }) => (
  <div>
    <div className="field">
      <label className="label">DEPARTMENT PERSONA PROMPT</label>
      <textarea className="textarea" rows={6} placeholder={`You are the ${data.name || 'Department'} Head. You are responsible for...\n\nYOUR RESPONSIBILITIES:\n- ...\n\nYOUR RULES:\n- NEVER take irreversible actions without approval\n- ...`} value={data.prompt} onChange={e => onChange({ ...data, prompt: e.target.value })} />
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: data.prompt.length < 50 ? "var(--red)" : "var(--text-3)", marginTop: 4 }}>
        {data.prompt.length} chars {data.prompt.length < 50 ? "— minimum 50 required" : "✓"}
      </div>
    </div>
    <div style={{ marginTop: 4, padding: "10px 12px", background: "var(--bg-4)", borderRadius: 6, fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--text-3)", lineHeight: 1.7 }}>
      <div style={{ color: "var(--accent)", marginBottom: 4 }}>↓ The agent also receives:</div>
      <div>① Crost Constitution (8 non-negotiable rules)</div>
      <div>② Your Local Identity (tone + market context)</div>
      <div>③ This persona prompt</div>
    </div>
  </div>
);

const TOOLS = [
  { id: "github", label: "GitHub", risk: "high" },
  { id: "gmail", label: "Gmail", risk: "high" },
  { id: "slack", label: "Slack", risk: "medium" },
  { id: "supabase_query", label: "DB Query", risk: "low" },
  { id: "apollo_mcp", label: "Apollo.io", risk: "medium" },
  { id: "web_search", label: "Web Search", risk: "low" },
  { id: "file_reader", label: "File Reader", risk: "low" },
];

const MODELS = ["local/gemma3", "local/gemma3-lite", "local/llama3", "local/mistral", "cloud/gemini-pro", "cloud/claude-sonnet", "cloud/groq-llama"];

const WizardStep3 = ({ data, onChange }) => (
  <div>
    <div className="field">
      <label className="label">TOOLS</label>
      <div>
        {TOOLS.map(t => (
          <span key={t.id} className={`tool-chip ${data.tools.includes(t.id) ? "selected" : ""}`}
            onClick={() => onChange({ ...data, tools: data.tools.includes(t.id) ? data.tools.filter(x => x !== t.id) : [...data.tools, t.id] })}>
            {t.label}
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, opacity: 0.7, color: t.risk === "high" ? "var(--red)" : t.risk === "medium" ? "var(--amber)" : "inherit" }}>
              {t.risk}
            </span>
          </span>
        ))}
      </div>
      {data.tools.some(t => ["github","gmail"].includes(t)) && (
        <div style={{ marginTop: 8, fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--amber)", padding: "6px 10px", background: "rgba(255,179,71,0.08)", borderRadius: 4, border: "1px solid rgba(255,179,71,0.15)" }}>
          ⚠ High-risk tools selected — all actions require Approval Feed sign-off
        </div>
      )}
    </div>
    <div className="field">
      <label className="label">DEFAULT MODEL</label>
      <select className="input" value={data.model} onChange={e => onChange({ ...data, model: e.target.value })} style={{ cursor: "pointer" }}>
        {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  </div>
);

const WizardStep4 = ({ data }) => (
  <div>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: data.color + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name="shield" size={16} color={data.color} />
      </div>
      <div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15 }}>{data.name || "New Department"}</div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--text-3)" }}>/{data.slug}</div>
      </div>
      <div style={{ marginLeft: "auto" }}>
        <span className="activation-badge draft">DRAFT</span>
      </div>
    </div>

    <div style={{ background: "var(--bg-3)", borderRadius: 6, padding: "10px 12px", marginBottom: 12 }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--text-3)", marginBottom: 6 }}>TOOLS</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {data.tools.length > 0 ? data.tools.map(t => <span key={t} className="tool-chip selected" style={{ cursor: "default" }}>{t}</span>) : <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--text-3)" }}>none selected</span>}
      </div>
    </div>

    <div style={{ background: "var(--bg-3)", borderRadius: 6, padding: "10px 12px", marginBottom: 12 }}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--text-3)", marginBottom: 4 }}>MODEL</div>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "var(--accent)" }}>{data.model}</div>
    </div>

    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--text-3)", padding: "8px 10px", background: "var(--accent-dim)", borderRadius: 4, border: "1px solid var(--accent-glow)" }}>
      ✓ Department will start in DRAFT — review and activate before running tasks.
    </div>
  </div>
);

// Create Department Modal
const CreateDeptModal = ({ onClose, onCreate }) => {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ name: "", slug: "", color: "#0ea5e9", prompt: "", tools: [], model: "local/gemma3" });

  const steps = ["Identity", "Persona", "Tools", "Review"];
  const canNext = [
    data.name.length >= 2,
    data.prompt.length >= 50,
    true,
    true,
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in">
        <div className="modal-header">
          <span className="modal-title syne">New Department</span>
          <div className="icon-btn" onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer" }}>
            <Icon name="x" size={14} color="var(--text-2)" />
          </div>
        </div>
        <div className="modal-body">
          <div className="wizard-steps">
            {steps.map((s, i) => (
              <div key={s} className={`wizard-step ${i < step ? "done" : i === step ? "current" : ""}`} />
            ))}
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--text-3)", marginBottom: 16, letterSpacing: "0.08em" }}>
            STEP {step + 1} / {steps.length} — {steps[step].toUpperCase()}
          </div>

          {step === 0 && <WizardStep1 data={data} onChange={setData} />}
          {step === 1 && <WizardStep2 data={data} onChange={setData} />}
          {step === 2 && <WizardStep3 data={data} onChange={setData} />}
          {step === 3 && <WizardStep4 data={data} />}
        </div>
        <div className="modal-footer">
          {step > 0 && (
            <button className="btn" style={{ background: "var(--bg-3)", color: "var(--text-2)", border: "1px solid var(--border)" }} onClick={() => setStep(s => s - 1)}>
              Back
            </button>
          )}
          {step < 3 ? (
            <button className="btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canNext[step]} style={{ opacity: canNext[step] ? 1 : 0.4, cursor: canNext[step] ? "pointer" : "not-allowed" }}>
              Continue →
            </button>
          ) : (
            <button className="btn-primary" onClick={() => onCreate(data)}>
              Create Department
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function CrostDashboard() {
  const [mode, setMode] = useState("local");
  const [view, setView] = useState("departments"); // departments | approvals | memos | constitution
  const [events, setEvents] = useState(EVENTS_INITIAL);
  const [approvals, setApprovals] = useState(APPROVALS);
  const [departments, setDepartments] = useState(DEPARTMENTS);
  const [showWizard, setShowWizard] = useState(false);
  const [newEventId, setNewEventId] = useState(null);
  const [selectedDept, setSelectedDept] = useState(null);
  const eventRef = useRef(null);

  // Simulate live events
  useEffect(() => {
    const msgs = [
      { dept: "Engineering", desc: "Token usage: 1,240 tokens consumed this session", color: "#0ea5e9" },
      { dept: "Operations", desc: "Draft contract: 2 clauses flagged for review", color: "#64748b" },
      { dept: "Sales", desc: "Apollo search complete: 3 new contacts found", color: "#22c55e" },
      { dept: "Finance", desc: "Runway model updated: 7.2 months remaining", color: "#a855f7" },
    ];
    let i = 0;
    const interval = setInterval(() => {
      const msg = msgs[i % msgs.length];
      const newEvent = { id: Date.now(), type: "task_update", dept: msg.dept, desc: msg.desc, time: "just now", color: msg.color };
      setNewEventId(newEvent.id);
      setEvents(prev => [newEvent, ...prev.slice(0, 14)]);
      // Update previous "just now" items
      setTimeout(() => {
        setEvents(prev => prev.map(e => e.id === newEvent.id ? e : e.time === "just now" ? { ...e, time: "1m ago" } : e));
      }, 5000);
      i++;
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = (id) => {
    setApprovals(prev => prev.filter(a => a.id !== id));
    const a = approvals.find(x => x.id === id);
    const newEvent = { id: Date.now(), type: "approval_approved", dept: a.dept, desc: `Approved: ${a.action}`, time: "just now", color: "#00d4aa" };
    setEvents(prev => [newEvent, ...prev.slice(0, 14)]);
  };

  const handleReject = (id) => {
    setApprovals(prev => prev.filter(a => a.id !== id));
    const a = approvals.find(x => x.id === id);
    const newEvent = { id: Date.now(), type: "approval_rejected", dept: a.dept, desc: `Rejected: ${a.action}`, time: "just now", color: "#ff4d6d" };
    setEvents(prev => [newEvent, ...prev.slice(0, 14)]);
  };

  const handleCreateDept = (data) => {
    const newDept = {
      id: Date.now(),
      name: data.name,
      slug: data.slug,
      icon: "shield",
      color: data.color,
      stage: "draft",
      status: "idle",
      task: null,
      model: data.model,
      tokens: 0,
    };
    setDepartments(prev => [...prev, newDept]);
    setShowWizard(false);
    const newEvent = { id: Date.now(), type: "department_created", dept: data.name, desc: `Department created: ${data.name} (DRAFT)`, time: "just now", color: data.color };
    setEvents(prev => [newEvent, ...prev.slice(0, 14)]);
  };

  const pendingCount = approvals.length;

  const NAV = [
    { id: "departments", label: "Dashboard", icon: "grid" },
    { id: "approvals", label: `Approvals`, icon: "approvals", badge: pendingCount },
    { id: "memos", label: "Memos", icon: "memos" },
    { id: "constitution", label: "Constitution", icon: "shield" },
  ];

  return (
    <>
      <style>{FONTS}{CSS}</style>
      <div className="shell">
        {/* SIDEBAR */}
        <div className="sidebar">
          <div className="sidebar-logo">
            <div className="logo-mark">C</div>
            <span className="logo-text syne">Crost</span>
            <span style={{ marginLeft: "auto", fontFamily: "'DM Mono', monospace", fontSize: 9, color: "var(--text-3)", background: "var(--bg-3)", padding: "2px 6px", borderRadius: 4 }}>v1.0</span>
          </div>

          <div className="sidebar-nav">
            <div className="nav-section">Workspace</div>
            {NAV.map(n => (
              <div key={n.id} className={`nav-item ${view === n.id ? "active" : ""}`} onClick={() => setView(n.id)}>
                <Icon name={n.icon} size={14} />
                <span>{n.label}</span>
                {n.badge > 0 && (
                  <span style={{ marginLeft: "auto", minWidth: 18, height: 18, background: "var(--red)", borderRadius: 9, fontFamily: "'DM Mono', monospace", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                    {n.badge}
                  </span>
                )}
              </div>
            ))}

            <div className="nav-section" style={{ marginTop: 8 }}>Activity</div>
            <div className={`nav-item`}>
              <Icon name="activity" size={14} />
              <span>Event Log</span>
            </div>
            <div className={`nav-item`}>
              <Icon name="user" size={14} />
              <span>Founder</span>
            </div>
          </div>

          <div className="sidebar-bottom">
            <div className="nav-item" onClick={() => setView("settings")}>
              <Icon name="settings" size={14} />
              <span style={{ fontSize: 13 }}>Settings</span>
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div className="main">
          {/* TOPBAR */}
          <div className="topbar">
            <div className="topbar-left">
              <span className="topbar-title syne">
                {view === "departments" && "Agent Office"}
                {view === "approvals" && "Approval Feed"}
                {view === "memos" && "Company Memos"}
                {view === "constitution" && "Agent Constitution"}
              </span>
            </div>
            <div className="topbar-right">
              <span className="mode-label mono">MODE</span>
              <div className="mode-toggle">
                <button className={`mode-btn local ${mode === "local" ? "active" : ""}`} onClick={() => setMode("local")}>
                  LOCAL
                </button>
                <button className={`mode-btn cloud ${mode === "cloud" ? "active" : ""}`} onClick={() => setMode("cloud")}>
                  CLOUD
                </button>
              </div>

              <div className="icon-btn" onClick={() => setView("approvals")}>
                <Icon name="bell" size={14} />
                {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
              </div>

              <div className="icon-btn">
                <Icon name="settings" size={14} />
              </div>
            </div>
          </div>

          {/* CONTENT */}
          <div className="content">
            <div className="dept-grid">
              {/* DEPARTMENTS VIEW */}
              {view === "departments" && (
                <>
                  <div className="grid-header">
                    <span className="grid-title mono">{departments.filter(d => d.stage !== "deprecated").length} DEPARTMENTS</span>
                    <button className="btn-primary" onClick={() => setShowWizard(true)}>
                      <Icon name="plus" size={12} color="#000" />
                      New Department
                    </button>
                  </div>
                  <div className="dept-cards">
                    {departments.filter(d => d.stage !== "deprecated").map(dept => (
                      <DepartmentCard key={dept.id} dept={dept} onClick={setSelectedDept} />
                    ))}
                    <AddDeptCard onClick={() => setShowWizard(true)} />
                  </div>
                </>
              )}

              {/* APPROVALS VIEW */}
              {view === "approvals" && (
                <>
                  <div className="grid-header">
                    <span className="grid-title mono">{approvals.length} PENDING APPROVALS</span>
                    <div className="view-tabs">
                      <button className="view-tab active">Pending</button>
                      <button className="view-tab">Approved</button>
                      <button className="view-tab">Rejected</button>
                    </div>
                  </div>
                  {approvals.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-3)", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                      All caught up — no pending approvals
                    </div>
                  ) : (
                    approvals.map(a => (
                      <ApprovalItem key={a.id} item={a} onApprove={handleApprove} onReject={handleReject} />
                    ))
                  )}
                </>
              )}

              {/* MEMOS VIEW */}
              {view === "memos" && (
                <>
                  <div className="grid-header">
                    <span className="grid-title mono">{MEMOS.length} COMPANY MEMOS</span>
                    <div className="view-tabs">
                      <button className="view-tab active">All</button>
                      <button className="view-tab">Urgent</button>
                      <button className="view-tab">Unread</button>
                    </div>
                  </div>
                  {MEMOS.map((m, i) => <MemoItem key={i} memo={m} />)}
                </>
              )}

              {/* CONSTITUTION VIEW */}
              {view === "constitution" && (
                <>
                  <div className="grid-header">
                    <span className="grid-title mono">AGENT CONSTITUTION</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: "var(--accent)", background: "var(--accent-dim)", padding: "3px 8px", borderRadius: 8 }}>READ-ONLY CORE</span>
                  </div>
                  <ConstitutionViewer />
                  <div style={{ marginTop: 20, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 16 }}>
                    <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Local Identity</div>
                    <div className="constitution-text" style={{ marginBottom: 0 }}>
                      Write professionally and with cultural awareness for your market. Be direct, warm, and human. Avoid corporate buzzwords.
                    </div>
                    <button className="btn-primary" style={{ marginTop: 12 }}>Edit Identity</button>
                  </div>
                </>
              )}
            </div>

            {/* EVENT LOG PANEL */}
            <div className="event-panel">
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">LIVE EVENTS</span>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: "var(--accent)" }}>● LIVE</span>
                </div>
                <div className="panel-body" ref={eventRef}>
                  {events.map((e, i) => (
                    <EventItem key={e.id} event={e} isNew={e.id === newEventId && i === 0} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CREATE DEPT MODAL */}
      {showWizard && (
        <CreateDeptModal onClose={() => setShowWizard(false)} onCreate={handleCreateDept} />
      )}
    </>
  );
}
