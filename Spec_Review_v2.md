  Crost Spec v2.2 vs. Codebase — Full Review Report                             
                                                                                
  Scope: CROST_SPEC.md (v2.2, April 20 2026) vs. current main (v11.8, April 21  
  2026)                                                                         
  Method: Semantic graph + direct file inspection across all key spec sections  
  Risk scoring: 🔴 Critical (MVP blocker / DoD fail) · 🟠 High (spec violation /
   trust gap) · 🟡 Medium (partial / degraded) · 🟢 Minor / polish              
                                                                                
  ---                                                                           
  🔴 CRITICAL — MVP Blockers
                            
  1. §6.1 Suggested Next Actions — Entirely Absent
                                                                                
  Blast radius: WarRoom completion messages, ArtifactCard, MissionReport,       
  Dashboard widget, approval_queue, executeToolCall gateway, DoD #11            
                                                                                
  What the spec requires: A first-class SuggestedAction entity with a 10-slug   
  catalog (send_to_email, save_to_kb, make_changes, add_to_memo, etc.), a
  dedicated suggested_actions DB table, chip rendering in 4 surfaces (War Room, 
  Artefact card, Mission Report, Dashboard), full execution contract through
  executeSuggestedAction() wired back to the HITL approval_queue.

  What exists: Zero. No SuggestedAction type in types/index.ts. No              
  suggested_actions table. No chip rendering anywhere. No
  executeSuggestedAction(). The War Room completion message (Beat 9 magic       
  moment) is missing entirely.

  DoD items that fail: #10 (Mission Report "Suggested Next Actions" section),   
  #11 (chip-tap end-to-end), any check of SuggestedAction.status flow.
                                                                                
  Suggested fix:                                                                
  - Add SuggestedAction interface to types/index.ts
  - Create suggested_actions Supabase table (migration)                         
  - Add executeSuggestedAction() in lib/tools/ that calls executeToolCall and
  threads outcomes back                                                         
  - Render chips in WarRoom.tsx (after runOrcReport completes), in              
  ArtifactCard.tsx (persistent footer), and in the Mission Report memo view     
  - Add "What next?" widget on the dashboard page                               
                  
  ---                                                                           
  2. §9.5 Skills Layer — Entirely Absent
                                                                                
  Blast radius: All artefact generation, artifacts table schema, Artifact
  TypeScript type, executeToolCall task runner, DoD #5 and #6                   
                  
  What the spec requires: 5 starter skills (pptx, docx, xlsx, pdf, pitch_deck)  
  as SKILL.md + optional helper code under frontend/lib/skills/<slug>/.
  Departments load the skill prompt before the LLM call. Every artefact records 
  skills_used: string[].

  What exists: frontend/lib/skills/ does not exist. Artifact TypeScript type has
   no skills_used field. CreateArtifactSchema in /api/artifacts/route.ts has no
  skills_used field. No skill loading logic anywhere in llm-client.ts or the    
  worker.         

  DoD items that fail: #5 ("artefact produced via the Skills layer"), #6        
  ("skills_used populated").
                                                                                
  Suggested fix:  
  - Create frontend/lib/skills/{pptx,docx,xlsx,pdf,pitch_deck}/SKILL.md
  - Add skills_used: string[] to Artifact type and CreateArtifactSchema         
  - Add loadSkillsForTask(taskType, deptSlug) in lib/skills/index.ts   
  - Inject skill content into department prompt in the worker execute route     
                                                                                
  ---                                                                           
  3. §9 Artefact Citations (sources field) — Missing                            
                                                                                
  Blast radius: Every artefact, Artifact type, ArtifactCard,
  execute-tool-call.ts, runOrcReport, DoD #6/#8/#13/#14                         
                  
  What the spec requires: Every artefact populates sources: { memo_ids: UUID[], 
  kb_file_ids: UUID[], tool_calls: object[] }. ArtifactCard renders a "Sources"
  footer. Citations are also written inside the file (DOCX footnote, PPTX final 
  slide). KB search writes matched file_id back to the calling artefact.

  What exists:
  - Artifact interface in types/index.ts has no sources field (lines 133–146)
  - CreateArtifactSchema in /api/artifacts/route.ts has no sources field        
  - ArtifactCard.tsx has no Sources section — only CONTENT PREVIEW and METADATA
  (lines 434–503)                                                               
  - execute-tool-call.ts writes to company_memos but never back-fills           
  artifacts.sources.tool_calls                                       
  - /api/knowledge/search/route.ts returns matches but never updates the calling
   artefact's sources.kb_file_ids                                               
  - runOrcReport (lib/llm-client.ts:1099) synthesizes a report with no sources  
  field populated                                                             
                                                                                
  DoD items that fail: #6, #8, #13, #14.
                                                                                
  Suggested fix:  
  - Add sources: { memo_ids: string[]; kb_file_ids: string[]; tool_calls:       
  object[] } to Artifact type and migration                                     
  - Add sources to CreateArtifactSchema    
  - ArtifactCard: render a "Sources" collapsible section below the preview      
  listing memo refs + KB files                                            
  - Pass calling artifact_id through the execution context and update sources   
  after KB search returns                                                    
  - execute-tool-call.ts: append to artifacts.sources.tool_calls after          
  successful execution
                                                                                
  ---             
  4. §7 Mission Reports — Partial/Broken                                        
                                                                                
  Blast radius: runOrcReport, Memo display, Inbox, DoD #10
                                                                                
  What the spec requires: Auto-written Mission Reports for success/fail/partial,
   a sources section, a Suggested Next Actions section, event type              
  goal_mission_report_written emitted, accessible from artefact detail and      
  Inbox.          

  What exists:
  - runOrcReport exists (lib/llm-client.ts:1099) and writes a [ORC REPORT] memo
  to company_memos                                                              
  - No sources section in the synthesized report
  - No suggested_actions section (upstream gap from item 1)                     
  - No goal_mission_report_written event emitted — the event type exists in
  types/index.ts but is never fired                                             
  - Report is a freeform company_memos row, not a typed mission_reports entity  
  with a canonical schema                                                       
  - No Inbox integration that surfaces the report                               
                  
  Suggested fix:                                                                
  - After writing the [ORC REPORT] memo, emit goal_mission_report_written event
  via logEvent()                                                                
  - Include the sources aggregated from all task memos in the synthesized report
  - Include a Suggested Next Actions section (blocked by item 1, but the        
  structure should be prepared)                                                 
                                                                                
  ---                                                                           
  5. §11 Risk Mode Not Wired to executeToolCall                                 
                                                                                
  Blast radius: Every tool execution, execute-tool-call.ts, approval experience,
   Careful/Balanced/Aggressive founder setting                                  
                  
  What the spec requires: risk_tolerance from system_config drives the approval 
  threshold per the three-mode table (Careful = all require; Balanced = low
  auto; Aggressive = low+medium auto).                                          
                  
  What exists: execute-tool-call.ts uses a hardcoded LOW_RISK_READ_TOOLS        
  whitelist regardless of the founder's risk mode setting. risk_tolerance is
  never read from system_config. The Control Style onboarding step writes       
  riskTolerance to the store and to system_config, but executeToolCall ignores
  it entirely (grep on risk_tolerance in execute-tool-call.ts returns 0
  matches).

  Suggested fix:
  // In executeToolCall, before the requiresApproval logic:
  const { data: config } = await supabase                  
    .from('system_config').select('value').eq('key',                            
  'risk_tolerance').eq('user_id', userId).maybeSingle()
  const riskMode = (config?.value as string) ?? 'balanced'                      
  // Then apply the three-mode threshold table
                                                                                
  ---             
  🟠 HIGH — Spec Violations / Trust Gaps                                        
                                                                                
  6. §9 Artefact artifact_type Enum Incomplete
                                                                                
  File: frontend/app/api/artifacts/route.ts:61, types/index.ts:138              
                                                                                
  Spec §9 MVP types include presentation (.pptx) and pdf. The current enum is   
  'image' | 'document' | 'code' | 'data' | 'spreadsheet'. Generating a .pptx
  would be stored with the wrong type, breaking filtering and the Skills layer. 
                  
  Fix: Add | 'presentation' | 'pdf' to both the Zod enum and the TypeScript     
  union.
                                                                                
  ---             
  7. §2 Beat 10 — No True In-Browser Preview
                                            
  Blast radius: ArtifactCard, DoD #7
                                                                                
  The spec requires in-browser preview before download — PDF.js for PDFs, iframe
   for HTML, first-slide thumbnail for PPTX/DOCX. What exists: a text extraction
   fallback that shows "Native File Available — download to open." For images   
  there's a real preview. Everything else is just metadata + truncated text. The
   "hope it's not a spam link" hesitation cited in Beat 10 is unresolved.

  Fix: Integrate PDF.js for .pdf types. Add first-page screenshot generation for
   PPTX/DOCX at creation time (store as preview_url). The preview_url field
  exists in the schema but is never populated for non-image files.              
                  
  ---
  8. §2 Beat 8 — Processing Copy Not Implemented
                                                                                
  Spec §2 Beat 8 defines a canonical list of office-themed loading messages and
  explicitly bans weapons/combat language. No loading copy from that list       
  appears anywhere in .tsx files. The War Room loading state is not inspected in
   detail here but the spec copy is a clear gap.                                
                  
  Fix: Add the canonical copy list as a constant in a shared file; use it in the
   War Room's isSubmittingGoal state and the processing indicator.
                                                                                
  ---             
  9. §15.6 Auth Bridge — Duplicate Email Edge Case Not Handled
                                                                                
  File: frontend/app/signup/page.tsx:19
                                                                                
  The ?email pre-fill is implemented correctly. However, spec §15.6 edge case:  
  "Duplicate email → redirect to /login, not /signup." Currently there is no    
  check — a returning user who clicks "Start Free" from the landing page with a 
  known email will hit a Supabase User already registered error and see a
  generic toast. user_consents auto-claim is also absent.

  Fix: On signUp error with code user_already_exists, redirect to               
  /login?email=.... Add a user_consents insert on successful signup when
  source=landing is in the URL params.                                          
                  
  ---
  10. §8 Memo — New Writes Go to Legacy Table
                                                                                
  Files: lib/tools/execute-tool-call.ts:191,300, lib/llm-client.ts:1117
                                                                                
  Spec §8: "New writes prefer the structured company_memo (singular)." Both     
  execute-tool-call.ts and runOrcReport write to company_memos (plural legacy   
  table). The structured company_memo table is never written to from these      
  paths.          

  Fix: Write task_logs and decisions entries to the structured                  
  company_memo.task_logs JSONB column (or equivalent migration); reserve
  company_memos for chat history only.                                          
                  
  ---
  11. §11 Email/Password OTP — Middleware Enforcement Gap
                                                                                
  File: frontend/middleware.ts:72
                                                                                
  The middleware routes based on user.user_metadata?.onboarding_step. An        
  email/password user who somehow has a session but an unverified email (e.g.,
  via magic link flow) would not be blocked from proceeding into onboarding. The
   spec says: "They cannot enter onboarding until they have verified their inbox
   link."

  Fix: In the middleware, for users authenticated via email provider, check     
  user.email_confirmed_at. If null, redirect to a blocking verification screen.
                                                                                
  ---             
  12. §2 Beat 9 — War Room Completion Message Missing Deep Link + Chips
                                                                                
  File: frontend/components/war-room/WarRoom.tsx
                                                                                
  The spec requires Orc's completion message to contain: a deep link to the     
  artefact, a one-paragraph summary, a citations footnote, and 2–3 suggested
  action chips. The current War Room has a SynthesisReportCard that shows the   
  ORC REPORT memo content — but no deep link to the artefact, no citations
  footnote, and no chips (upstream from item 1 above).

  ---
  🟡 MEDIUM — Partial/Degraded Implementation
                                                                                
  13. §9 Artifact.file_url Is Optional in Type but Required in Spec
                                                                                
  types/index.ts:143: file_url?: string | null (optional). Spec §9: "body text  
  fields are deprecated. New artefacts must have file_url populated." This      
  should be file_url: string (required, non-null) to enforce the spec. The API  
  route correctly validates it, but the TypeScript type doesn't match.

  ---
  14. KB Search — kb_file_ids Not Written Back to Artefact Sources
                                                                                
  File: frontend/app/api/knowledge/search/route.ts
                                                                                
  When knowledge_base_search is called from a department task, the matched      
  file_ids are returned in the response but never written to                    
  artifacts.sources.kb_file_ids on the calling artefact. DoD #14: "calling      
  artefact's sources.kb_file_ids is populated" — will fail.

  ---
  15. §15.5 Free Tier UI — Implementation Unknown
                                                                                
  usage-logger.ts and /api/usage/today/route.ts exist, which is good. But the
  Settings UI progress bar (green <75%, amber 75–90%, red >90%, "Resets at      
  [local time]", BYOK bypass message) needs verification. The spec requires a
  real progress bar, not just a number. This couldn't be verified without       
  inspecting the Settings component.

  ---
  16. executive Pseudo-Department — Spec vs. Reality
                                                    
  File: execute-tool-call.ts:28
                                                                                
  The executive department is defined in DEPARTMENT_TOOL_RULES (good). But the  
  gateway doesn't implement the executeSuggestedAction() entry point (item 1)   
  and doesn't have routing logic that auto-assigns send_to_email, save_to_kb,   
  etc. to executive. Right now there's no mechanism to route Orc's direct-action
   set through the executive pseudo-department.

  ---
  17. §16 Interaction Modes — ChatCommandMenu Filter Logic
                                                                                
  File: Session v11.6 fix included draft stage departments. The spec says @slug
  lists "active departments." The current filter includes draft — this creates a
   mismatch where departments not yet fully activated appear in the mention
  menu.                                                                         
                  
  ---
  18. goal_mission_report_written Event — Type Exists, Never Fired
                                                                                
  File: types/index.ts has goal_mission_report_written in the EventType union.
  runOrcReport in llm-client.ts:1117 writes the report memo but never emits this
   event. Live events panel will never show the completion event.
                                                                                
  ---             
  🟢 MINOR / POLISH
                   
  19. §17 — user_consents Table Not Referenced Anywhere in Code
                                                                                
  Spec §15.8 lists user_consents as an MVP-relevant table. No references found  
  in the codebase.                                                              
                                                                                
  20. §15.3 Model Routing — selectModel Not Implemented as Spec Describes       
   
  The spec shows a selectModel(task) function returning HIGH/FAST/ULTRA_FAST    
  models based on task type. getModel() in llm-client.ts exists but uses a
  different routing approach (role-based, not task-type-based). Minor divergence
   but worth aligning.

  21. Signup CTA Copy — "Initialize Crost →" (line 118)                         
   
  Slightly jargon-y. Spec §2 Beat 2 implies the primary signup CTA should feel  
  no-friction. Not a functional gap, but consider "Create your Crost →" or
  "Start Free →".                                                               
                  
  22. §7 "Mission Report" Terminology                                           
   
  runOrcReport writes the title as [ORC REPORT] not [MISSION REPORT]. Spec §7:  
  "The term 'Mission Report' is canonical and replaces all earlier names ('Orc
  Report', 'Post-mortem', etc.)."                                               
                  
  ---
  Summary Table
                                                                                
  ┌─────┬─────────┬─────────────────────────────┬───────────┬──────────────┐ 
  │  #  │ Section │             Gap              │ Severity  │  DoD Items   │   
  │     │         │                              │           │   Blocked    │
  ├─────┼─────────┼──────────────────────────────┼───────────┼──────────────┤
  │ 1   │ §6.1     │ Suggested Next Actions       │ 🔴        │ #10, #11    │
  │     │          │ entirely missing             │ Critical  │             │   
  ├─────┼──────────┼──────────────────────────────┼───────────┼─────────────┤
  │ 2   │ §9.5     │ Skills Layer entirely        │ 🔴        │ #5, #6      │   
  │     │          │ missing                      │ Critical  │             │
  ├─────┼──────────┼──────────────────────────────┼───────────┼─────────────┤
  │ 3   │ §9       │ Artefact sources (citations) │ 🔴        │ #6, #8,     │
  │     │          │  missing                     │ Critical  │ #13, #14    │   
  ├─────┼──────────┼──────────────────────────────┼───────────┼─────────────┤
  │ 4   │ §7      │ Mission Reports missing      │ 🔴       │ #10         │     
  │     │         │ sources + event              │ Critical │             │     
  ├─────┼─────────┼──────────────────────────────┼──────────┼─────────────┤  
  │ 5   │ §11     │ Risk mode not wired to       │ 🔴       │ HITL        │     
  │     │         │ executeToolCall              │ Critical │ contract    │     
  ├─────┼─────────┼──────────────────────────────┼──────────┼─────────────┤  
  │ 6   │ §9      │ artifact_type enum missing   │ 🟠 High  │ #5          │     
  │     │         │ presentation/pdf             │          │             │     
  ├─────┼─────────┼──────────────────────────────┼──────────┼─────────────┤  
  │ 7   │ §2 Beat │ No true in-browser preview   │ 🟠 High  │ #7          │     
  │     │  10     │ (PDF.js, PPTX thumb)         │          │             │     
  ├─────┼─────────┼──────────────────────────────┼──────────┼─────────────┤  
  │ 8   │ §2 Beat │ Processing copy list not     │ 🟠 High  │ Beat 8 UX   │     
  │     │  8      │ implemented                  │          │             │     
  ├─────┼─────────┼──────────────────────────────┼──────────┼─────────────┤  
  │ 9   │ §15.6   │ Auth Bridge: duplicate email │ 🟠 High  │ DoD #1      │     
  │     │         │  + user_consents missing     │          │             │     
  ├─────┼─────────┼──────────────────────────────┼──────────┼─────────────┤  
  │     │         │ New writes go to legacy      │          │ Memo        │     
  │ 10  │ §8      │ company_memos, not           │ 🟠 High  │ integrity   │     
  │     │         │ company_memo                 │          │             │
  ├─────┼─────────┼──────────────────────────────┼──────────┼─────────────┤     
  │     │         │ Middleware doesn't block     │          │             │
  │ 11  │ §11     │ unverified email/password    │ 🟠 High  │ DoD #2      │     
  │     │         │ users                        │          │             │
  ├─────┼─────────┼──────────────────────────────┼──────────┼─────────────┤     
  ├─────┼─────────┼─────────────────────────────────┼──────────┼────────────┤
  │ 13  │ §9      │ file_url optional in type,      │ 🟡       │ Type       │   
  │     │         │ required in spec                │ Medium   │ safety     │
  ├─────┼─────────┼─────────────────────────────────┼──────────┼────────────┤   
  │ 14  │ §10     │ KB search doesn't write         │ 🟡       │ DoD #14    │   
  │     │         │ kb_file_ids to artefact         │ Medium   │            │
  ├─────┼─────────┼─────────────────────────────────┼──────────┼────────────┤   
  │ 15  │ §15.5   │ Free tier progress bar needs    │ 🟡       │ DoD #13    │
  │     │         │ verification                    │ Medium   │            │
  ├─────┼─────────┼─────────────────────────────────┼──────────┼────────────┤
  │ 16  │ §16     │ executive routing for Orc       │ 🟡       │ Beat 11    │   
  │     │         │ direct-action set absent        │ Medium   │            │
  ├─────┼─────────┼─────────────────────────────────┼──────────┼────────────┤   
  │ 17  │ §16     │ ChatCommandMenu shows draft     │ 🟡       │ UX         │   
  │     │         │ departments                     │ Medium   │ fidelity   │
  ├─────┼─────────┼─────────────────────────────────┼──────────┼────────────┤   
  │ 18  │ §7      │ goal_mission_report_written     │ 🟡       │ Live       │   
  │     │         │ never emitted                   │ Medium   │ events     │
  ├─────┼─────────┼─────────────────────────────────┼──────────┼────────────┤   
  │ 19  │ §15.8   │ user_consents table             │ 🟢 Minor │ —          │   
  │     │         │ unreferenced                    │          │            │   
  ├─────┼─────────┼─────────────────────────────────┼──────────┼────────────┤   
  │ 20  │ §15.3   │ Model routing diverges from     │ 🟢 Minor │ —          │   
  │     │         │ spec                            │          │            │   
  ├─────┼─────────┼─────────────────────────────────┼──────────┼────────────┤
  │ 21  │ §2      │ Signup CTA copy "Initialize     │ 🟢 Minor │ —          │   
  │     │         │ Crost" feels off                │          │            │   
  ├─────┼─────────┼─────────────────────────────────┼──────────┼────────────┤
  │ 22  │ §7      │ Report titled [ORC REPORT] not  │ 🟢 Minor │ —          │   
  │     │         │ [MISSION REPORT]                │          │            │   
  └─────┴─────────┴─────────────────────────────────┴──────────┴────────────┘
                                                                                
  ---             
  Highest-leverage next actions (in order):
                                                                                
  1. Build the Skills Layer first — it unblocks artefact quality and DoD #5/#6
  in ~3–5 days                                                                  
  2. Add sources to Artifact schema and write-back — unblocks DoD #6/#8/#13/#14
  and is a prerequisite for citations everywhere                                
  3. Build SuggestedAction + chip rendering — the single largest missing
  feature; needed for the Beat 9 magic moment and DoD #11                       
  4. Wire risk_tolerance into executeToolCall — 1-hour fix, closes a core HITL
  contract gap                                                                  
  5. Fix Mission Report — rename, add sources, add event emission — ~2 hours
