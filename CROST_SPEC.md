# CROST — Final Specification (v2.2)

> **Status:** Source of truth. Supersedes `CROST_SPEC.md`, `CROST_SPEC_1.md`, and the standalone `CROST_ONBOARDING_SPEC.md`.
> **Audience:** Product, Marketing, and Engineering — read end to end.
> **Owners:** Crost leadership approves all changes. Engineering keeps §15 in sync with shipped reality.
> **Last updated:** April 20, 2026.
> **Companion docs:** `CROST_MASTER.md` (execution log) remains the live record of what is shipped.

---

## How to read this document

This spec is organized in five layers:

1. **§0–§3 — Why and Who.** Product philosophy, principles, and the first-run journey. If you only have ten minutes, read these.
2. **§4–§14 — What Crost Is.** Each surface of the product (Orc, Departments, Missions, Memo, Artefacts, Knowledge Base, Inbox, Tools, Dashboard, War Room, Interaction Modes) with its rules, data model, and copy guidance.
3. **§15–§17 — How We Build It.** System architecture, MVP scope, post-MVP roadmap. Engineering canon lives here.
4. **§18 — Founder Decisions (Locked).** The product questions raised in the founder simulation, with the resolved decision for each.
5. **§19 — Cowork Alignment Notes.** Strategic positioning observations and architectural patterns Crost shares with Anthropic's Cowork product. Pitch-ready.
6. **Appendix A — Reconciliation Notes.** Where the two prior specs disagreed and what we picked.

When this document and any earlier spec disagree, this document wins. When this document and shipped reality disagree, raise it in `CROST_MASTER.md` and bring it back to Crost leadership.

---

# 0. Core Philosophy

Crost is not a chatbot.

Crost is a **Human-in-the-Loop Company Operating System** where AI simulates departments, coordinated by a central Chief of Staff (Orc), to help a founder run a company.

The goal is not task automation for its own sake. The goal is to help founders **think better, operate faster, and execute more consistently**.

Crost must always preserve clarity, control, founder trust, visibility, human approval, and useful outputs over novelty.

This is not about automating tasks. It is about augmenting decision-making at the company level.

---

# 1. Product Principles

Crost should feel like an **office**, not a chat window.

The founder should feel like they are operating through one intelligent layer, not juggling many disconnected assistants.

The product rules:

- Orc is the primary interface layer. Departments live mostly behind the scenes.
- Users should reach value quickly. The first artefact lands in under five minutes from signup.
- Users should never hit dead ends. Every screen explains itself; every mission ends with a suggested next step.
- External actions require explicit approval. Always. No exceptions in MVP.
- Crost should feel operational, not conversational for the sake of conversation.
- Crost should guide confused users without overwhelming them.
- Crost should stay useful even when the founder is not actively chatting (background memos, mission reports, suggested actions).
- Useful outputs over novelty. A passable PPTX beats a clever conversation.
- Every meaningful output is **cited** — the founder can always see which Memo entries, Knowledge Base files, and tool calls fed into it.

What Crost is **not**:

- Not a chatbot wrapper.
- Not a task queue.
- Not a multi-agent science project.
- Not a no-code builder.
- Not a marketplace (yet).
- Not a Cowork wrapper. Crost is the operating layer for a *company*, not for an individual's computer. (See §19.)

---

# 2. The First 10 Minutes (mapped to founder simulation)

Beat-by-beat narrative against the founder simulation. Each beat is followed by the **product requirement** it implies. If you are building or reviewing the onboarding, this is your scorecard.

> **Note:** The detailed engineering spec for onboarding lives in `CROST_ONBOARDING_SPEC.md` (4 screens + activation moment, ~3 minute timing budget, route guards, resume logic). This section captures the *experience* requirements that engineering spec must satisfy. The two should never drift; if they do, this section is the product intent and the onboarding spec is the implementation.

### Beat 1 — Landing arrival

> *"Nice interface, I like it, maybe another ChatGPT wrapper. Well let me see a quick demo."*

**Requirements:**

- Landing page (`crosthq.com`) must communicate four things above the fold: Crost is an AI company OS; Orc is the founder's Chief of Staff; departments execute work; founders remain in control.
- Two CTAs: **Start Free** (primary) and **See Demo** (secondary). The demo path is mandatory — skeptical users want proof before signup.
- "Start Free" captures email and redirects to `app.crosthq.com/onboarding/identity?email=…&source=landing`. See §15.6 (Auth Bridge).

### Beat 2 — Auth

> *"Lemme just use google sign up, I hate OTPs."*

**Requirements:**

- Auth methods, in order of prominence: **Google (primary), Apple (primary), Email/password (fallback only).**
- **OAuth path (Google/Apple):** no OTP, no email verification step. The OAuth provider has already verified ownership. Founder proceeds straight to onboarding identity.
- **Email/password fallback:** OTP-required *before any work happens*. Founder signs up → receives verification email → confirms ownership → then enters onboarding. This is non-negotiable: spammers are on the rise and we will not let unverified email-only accounts run missions or consume free-tier quota.
- Marketing copy must position OAuth as the "no friction" path so the funnel naturally pushes founders to Google/Apple over email/password. Email/password exists because some founders insist on it; it should not be the default visual treatment.
- See §11 for the full verification rule and §17 DoD #2 for the test gate.

### Beat 3 — Identity collection

> *"Company name, my name and location. Well I can fill this, not a lot to ask. Browser autofills. Orc translates correctly. Interesting, it translates my company details, maybe it even knows who I am."*

**Requirements:**

- Three questions, one at a time, each reflected back before the next appears (per `CROST_ONBOARDING_SPEC.md` §Screen 1):
  1. Name + city/country (autocomplete on city).
  2. What does your company do? — free text, sent to Orc's interpretation endpoint, returned as a short categorized phrase ("B2B credit infrastructure for informal retail. Noted.").
  3. Stage — Just starting / Early MVP / Getting traction / Scaling.
- Right-side panel builds a live "your profile" card as answers come in. This is the moment the product starts to feel like it is *learning* the founder, not interrogating them.
- Business interpretation must time out gracefully (3 sec) and never block onboarding.

### Beat 4 — Control style

> *(Inferred from onboarding spec — not in simulation but critical to setting approval thresholds.)*

**Requirements:**

- Three cards: Careful, Balanced (pre-selected), Aggressive. One click advances. No "Next" button.
- This sets `risk_tolerance` in `system_config`, which controls approval thresholds across departments.

### Beat 5 — Department selection

> *"Sees choose departments, tries to skip, no skip option??? Oh damn, I've to select at least two — well it's just few clicks. Eager to see what it really can do."*

**Requirements:**

- Cards pulled dynamically from the `departments` table (NOT hardcoded — see §5).
- Minimum 2 departments enforced. Maximum 3 for the activation moment to perform well.
- Each card: department name + one-sentence description + default model badge.
- "Add later" affordance visible on unselected cards.
- **Friction here is intentional.** The simulation shows the founder mildly annoyed but still moving — that's the right level. Below 2 departments, the first mission has nowhere to land.

### Beat 6 — Meet Orc + suggested first mission

> *"What's this Orc?? Should I be scared? I remember it from a movie… well no one introduced Orc, but at least it suggesting to write me a pitch deck, I'd laugh at it, but let it try."*

**Critical product gap surfaced by simulation:** Orc was never introduced. The founder met it cold and pattern-matched to *Lord of the Rings*. This must be fixed before department selection.

**Requirements:**

- Before the department selection screen, a single full-screen moment introduces Orc:

  > **"Meet Orc — your AI Chief of Staff."**
  > *Orc plans your work, coordinates departments, and helps you run your company. Departments are specialist teams Orc activates when needed.*

- Orc has a small visual mark (the `Crost-icon256.png` already in the workspace works). Not a face. Not anthropomorphized further.
- After department selection, Orc immediately proposes a **suggested first mission** based on the founder's interpreted business category. Examples: "Create a pitch deck", "Build an outreach plan", "Draft a go-to-market strategy", "Generate customer personas".
- The founder can accept the suggestion, edit it, type their own goal, or skip ("Skip for now — go to dashboard"). Skip is always visible.

### Beat 7 — Mission approval and department activation

> *"Approves task. Oops, I need a marketing department to help design slides? Okay, let me just activate it since this Orc is asking if it can activate it. Maybe Orc is a personal assistant??? Well, let's see. Accepts all, eager to see what's next."*

**Requirements:**

- If the suggested mission needs a department the founder didn't activate, Orc requests activation **inline, in the war room**, not as a modal. Copy: *"To deliver a pitch deck I'll need the Marketing department. Activate it?"* with a single Approve button.
- Approval is a single click. No multi-step confirmation.
- This is the moment Orc starts to feel like a personal assistant — and that perception is correct. See §4 and §18 Decision 1.

### Beat 8 — Processing & dashboard arrival

> *"Processing page shows while loading the task… it's taking a little long. Skips to dashboard. Orc is still planning, so war room isn't clickable yet. Waits a little bit more, then starts clicking other sidebar items. Oh it saved a memo from our onboarding? These are foundational truths though."*

**Requirements:**

- The dashboard must be **accessible during processing**. The simulation shows the founder skipping past the loading state — let them.
- The war room may show a "Orc is planning…" non-blocking banner, but the rest of the dashboard (Memo, Departments, Knowledge Base, Settings) is fully usable.
- The Memo already contains the company profile from onboarding. The founder finding this on their own ("These are foundational truths") is a positive surprise. Do not hide it behind a tour.
- Live events stream into a small "What Orc is doing" tray on the dashboard so the founder always sees motion.

**Processing copy — canonical list (no edgy/weapons language):**

Office-themed (calm, operational):
- Preparing your first mission
- Drawing strategy
- Coordinating departments
- Drafting artefacts
- Reviewing company context
- Building your war room
- Briefing the team
- Reading the room
- Connecting the dots
- Sketching the plan
- Aligning departments
- Pulling references

Playful but warm (sparingly):
- Putting on the boots
- Sharpening the pencils
- Clearing the desk
- Pinning the notes
- Warming up the team
- Pouring the coffee

**Forbidden copy:** anything involving weapons, combat, violence, or aggression ("loading the gun", "deploying troops", "attack mode", "ammo loaded"). The war-room metaphor is fine; war language is not. The product owner reviews any new processing copy before it ships.

### Beat 9 — First mission complete + the magic moment

> *"Orc chimes 'task complete' on the live events task bar. Tells the user to check the output (with an hyperlink/deep to the artefact page) and review if they need to change anything. Ends with an helpful question: 'What next? I can send this to your email or someone else or I can add it to our company knowledge base so we reference it anytime we need to.'"*

**Requirements:**

- Completion notification appears in the live events tray AND as a War Room message from Orc.
- The message contains: a deep link to the artefact, a one-paragraph summary of what was produced, a citations footnote (which Memo entries and KB files informed it — see §9), and 2–3 suggested next actions formatted as one-click chips. Default chips: **[Send to my email]**, **[Save to Knowledge Base]**, **[Make changes]**.
- A Mission Report is created automatically and accessible from the artefact and from the Memo.

### Beat 10 — Artefact review

> *"Wow, let me see what it did… hmmmm I have to download it first, hope it's not a spam link or file… Downloads anyway. Sees a clean formatted pptx that is not aligned to the brand but contains useful information and a lot of placeholders. It's not perfect, but I wasn't expecting something this good."*

**Requirements:**

- The artefact must be **previewable in-browser before download**. The "hope it's not a spam link" hesitation is the single most fixable trust friction in the entire flow. Build a preview pane (PDF.js for PDFs, native iframe for HTML, a thumbnail for PPTX/DOCX/XLSX with a "preview first slide / first page" affordance).
- The download button must clearly show the file type and size: `Pitch_Deck.pptx · 1.4 MB · Made by Marketing`.
- The artefact card surfaces its **citations** — which Memo entries, KB files, and tool calls were used. This builds trust and lets the founder spot when Orc has misunderstood context.
- Quality of the first artefact matters more than almost anything else in MVP. The **Skills layer** (§9.5) is what makes this quality bar achievable.

### Beat 11 — Action follow-through ("send to my email")

> *"I'd give it another spin, can it send it to my email truly? Types in war room: send the pitch deck to my email. Orc responds, sure I can help with that, you need to connect your Gmail and provide me the destination email, want to do that now? Connects Gmail and inputs destination. Orc processes it (without needing to call another department). Boom! New email with the pptx attached."*

**Requirements:**

- Orc handles the assistant-style request directly. It does **not** spawn a department for "send this to my email". See §4 and §18 Decision 1.
- Tool connection prompt is contextual, not nagged during onboarding. Copy: *"To send this I need access to your Gmail. Want to connect now?"*
- Connect flow: one click → OAuth via Composio → return to war room → Orc completes the action. No detour through Settings.
- After successful send, Orc reports back in the War Room with the message ID and a "View in Gmail" link.

### Beat 12 — The mobile pull

> *"Now that's what I'm talking about, it just does everything without needing my help. I hope this thing has a mobile app, can't wait to tell my friends I can do everything without needing to use my laptop. Bookmarks page and goes straight to App Store to search."*

**Requirements:**

- This is the strongest pull-through signal in the entire simulation. Mobile (Dispatch — see §16.3) is post-MVP, but the App Store search must not return zero results.
- **Action:** ship App Store and Play Store placeholder listings for "Crost Dispatch — Coming Soon" with email capture. Notify subscribers within 14 days of launch. ~1 day of design + marketing copy. Captures the highest-intent moment in the funnel.

---

# 3. User States & Lifecycle

Users may exist in several experience states, which determine what is visible, what is locked, what Orc suggests, which lifecycle emails fire, and which empty states show:

- Pre-auth
- Authenticated (OAuth — verified by provider)
- Authenticated (email/password — pending OTP)
- Authenticated (email/password — verified)
- Onboarding incomplete (resume from last completed screen — see `CROST_ONBOARDING_SPEC.md` §Resume Logic)
- Onboarding complete
- First mission pending
- First mission running
- First mission complete
- Active user
- Dormant user
- Returning user

Email/password unverified users see a **blocking screen** after signup: *"Check your inbox to verify your email and start your first mission."* They cannot enter onboarding until verified. OAuth users skip this entirely.

Incomplete onboarding never strands the verified user. The dashboard remains partially accessible and a "resume setup" banner appears at the top.

---

# 4. Orc (Chief of Staff)

Orc is the founder's AI Chief of Staff. Orc is **not just an assistant**, but Orc **also acts as the assistant** when that is the most direct path to founder value. (See §18 Decision 1.)

## Responsibilities

- Understand founder goals.
- Generate strategy, best-effort first.
- Break work into actionable tasks.
- Coordinate departments.
- Maintain company memory (read and write the Memo on every decision).
- Manage execution.
- Suggest next steps.
- Request approval when needed.
- Help the founder make decisions.
- Perform lightweight assistant actions directly: send to email, save to knowledge base, remind me later, connect a tool, rename an artefact, summarize a report.

## Behavior rules

Orc must:

- Attempt strategy before asking questions.
- Ask questions only when critical business info is missing, the decision is irreversible, or multiple valid paths exist.
- Ask in **conversational prose**, not as multiple-choice surfaces. A Chief of Staff has a conversation; it does not present forms. (Decision: conversational style is core to the CoS metaphor and we deliberately reject the structured-question pattern.)
- **Default to file output for substantive work.** Triggers: "draft a memo" → `.docx`; "make a presentation" → `.pptx`; "build a model" → `.xlsx`; "write a script" → code file. Orc should not ask "as a file or in chat?" — it picks the right format and links the artefact.
- Maintain a friendly, conversational, founder-confident tone.
- Always respect HITL — no execution of external actions without approval (§11).
- Always cite sources when producing substantive output (§9).

## Voice

Orc should feel **competent, helpful, concise, proactive, calm, trustworthy.**

Orc should not feel chatty, robotic, playful, verbose, or like a customer support bot.

## What Orc is not

- Not a department. Orc is never shown in the department gallery.
- Not a demo. Every Orc call is a real LLM call against the routing tier in §15.3.
- Not a chat tunnel. Orc is the front of an operating system, not a chat product.

---

# 5. Departments

Departments are specialist teams Orc activates when needed. They are **not** independent agents competing for control.

## Definition

```
Department = {
  id: UUID
  slug: string             // e.g. "marketing", "sales"
  name: string             // display name
  systemPrompt: string     // persona prompt
  tools: string[]          // tool slugs department may invoke
  taskTypes: string[]      // "planning" | "execution" | "analysis" | …
  activation_stage: 'active' | 'inactive' | 'experimental'
  is_orchestrator: boolean // true only for Orc; never shown in dept gallery
  onboarding_description: string  // one-sentence card text
}
```

## Behaviour

- Departments may be chatted with directly using `@<slug>` (see §14).
- Departments operate independently within a task but **read from and write to the Memo** on every task.
- Departments produce artefacts (§9) with citations (§9).
- Departments do **not** override Orc decisions.
- Departments are pulled dynamically from the `departments` table — never hardcoded in the UI.

## MVP department set

Marketing · Sales · Operations · Engineering · Finance · Legal · Customer Support.

Selection at onboarding requires 2–3. Founders can add more later.

## Future structure (post-MVP — see §16)

Long-term, a department is **not a single agent**. It is a Head of Department coordinating several specialist sub-agents (e.g., the Marketing department contains a Content sub-agent, an SEO sub-agent, an Outreach sub-agent, all coordinated by a Marketing Head). This is how real companies operate, and it's the right next-step abstraction once MVP ships. See §16.4.

---

# 6. Missions

A Mission is a goal Orc is actively executing. Missions may involve one department, multiple departments, artefacts, tool calls, approvals, and follow-up work.

## Mission rules

- Every mission has a clear objective (the founder's goal in their own words, and a one-line Orc restatement).
- Every mission has a visible status.
- Every mission produces a useful result.
- Every mission ends with suggested next steps.
- Every mission output carries citations (§9).

## Mission statuses

`pending`, `running`, `waiting_for_approval`, `completed`, `failed`, `cancelled`.

## Task object (within a mission)

```
Task = {
  id: string
  title: string
  department: string
  type: "planning" | "execution" | "analysis"
  status: "pending" | "running" | "done" | "failed"
  dependencies: string[]
  input_context: object
  output: object | null
  artefact_ids: string[]
  sources: { memo_ids: UUID[], kb_file_ids: UUID[], tool_calls: object[] }
}
```

## Execution rules

- Tasks may run in parallel where dependencies allow. Parallel-eligible tasks must dispatch concurrently — not sequentially with parallel labeling.
- No auto-retry in MVP. On failure, escalate to Orc and surface to the founder.
- The founder always sees the friendly strategy in natural language; the system uses the structured task list internally.

## Planning system

Hybrid: if the goal is complex, Orc generates a plan. If the goal is simple, Orc executes directly. The founder always sees the friendly version.

## 6.1 Suggested Next Actions (canonical contract)

A mission does not end when an artefact lands. Every mission, every artefact, and every Mission Report carries a set of **Suggested Next Actions** — concrete, one-tap follow-ups that the founder can approve to extend the work. This is what turns Crost from a one-shot generator into an operating system.

### Why this is a first-class concept

The simulation showed it: the founder finished the first mission, saw the magic moment, and immediately wanted to *do more* — send the artefact, save it, send it again to a contact, schedule a recurring version. Suggested Next Actions are how Orc closes that loop without forcing the founder to re-explain themselves.

### Data model

`suggested_actions` is a first-class field on three entities: **Artefacts** (§9), **Mission Reports** (§7), and **Memo task_logs entries** (§8). Schema:

```
SuggestedAction = {
  id: UUID
  source_entity: { type: "artefact" | "mission_report" | "memo", id: UUID }
  action_slug: string             // e.g. "send_to_email", "save_to_kb",
                                  // "make_changes", "schedule_recurring"
  label: string                   // human-readable chip label
  reasoning: string               // why Orc thinks this is useful next
  payload: object                 // pre-filled execution params
  required_tool: string | null    // e.g. "gmail" — drives connect prompt
  required_inputs: string[]       // e.g. ["destination_email"] — drives form
  risk_level: "low" | "medium" | "high" | "critical"
  status: "suggested" | "tapped" | "approved" | "executing"
        | "completed" | "failed" | "dismissed"
  approval_id: UUID | null        // populated when chip tap creates approval_queue row
  result_artefact_id: UUID | null // populated if action produced a new artefact
  created_at: timestamp
  resolved_at: timestamp | null
}
```

The list lives at `entity.suggested_actions: SuggestedAction[]` and is also queryable via its own `suggested_actions` table for cross-entity views ("show me everything Orc suggested I do this week").

### Canonical action catalog

The MVP catalog. Every entry has a stable `action_slug` so the gateway and the UI both recognize it. Departments and Orc may only emit actions from this catalog in MVP — extensibility comes post-MVP.

| `action_slug` | Label | Required tool | Risk | Default handler |
|---|---|---|---|---|
| `send_to_email` | Send to my email | Gmail | medium | Orc directly |
| `send_to_contact` | Send to someone else | Gmail | medium | Orc directly |
| `save_to_kb` | Save to Knowledge Base | — | low | Orc directly |
| `make_changes` | Make changes | — | low | Orc (re-opens War Room with context) |
| `schedule_recurring` | Run this every [interval] | — | low | Orc directly (post-MVP wiring — see §16/§19) |
| `add_to_memo` | Save as a decision in the Memo | — | low | Orc directly |
| `generate_companion` | Generate a companion artefact | — | medium | Routes to relevant department |
| `share_with_teammate` | Share with a teammate | Gmail/Slack | medium | Orc directly |
| `draft_followup` | Draft a follow-up message | — | low | Routes to relevant department |
| `start_new_mission` | Start a related mission | — | low | Orc (creates new mission with context) |

### Execution contract

Tapping a chip is an **explicit founder approval**, but it does **not** bypass the HITL approval queue for external actions. The flow is:

```
Founder taps chip
   ↓
SuggestedAction.status = "tapped"
   ↓
If required_inputs is non-empty:
   → render inline input panel (e.g. "Which email?") in the War Room
   → block until founder submits or cancels
   ↓
If required_tool is set AND not connected:
   → Orc surfaces contextual connect prompt ("Connect Gmail to continue")
   → on connect success, resume; on cancel, status = "dismissed"
   ↓
Compose final payload (canonical payload + founder inputs)
   ↓
Call executeToolCall(departmentId, service, action, payload, userId)
   ↓
If risk_level requires approval per §11 risk_mode mapping:
   → executeToolCall inserts approval_queue row, returns { requires_approval, approval_id }
   → SuggestedAction.status = "approved" only after founder confirms in Inbox
   → on approval, the queued action executes
Else:
   → executeToolCall executes immediately
   → SuggestedAction.status = "executing" → "completed"
   ↓
On completion:
   → write to Memo (§8 task_logs and decisions where appropriate)
   → if a new artefact was produced, link it via result_artefact_id
   → emit event: suggested_action_completed
   → Orc reports back in War Room with result + (often) a new set of suggestions
```

The key rule: **a chip tap is a one-tap *intent*, not a one-tap *bypass*.** External actions still flow through `approval_queue`. Internal/low-risk actions execute immediately. Risk mode (§11) determines which is which.

### Orc's direct-action set (Decision 1 enforcement)

Per §18 Decision 1, Orc IS the office assistant. The following `action_slug` values execute through Orc directly without spawning a department:

`send_to_email` · `send_to_contact` · `save_to_kb` · `add_to_memo` · `share_with_teammate` · `schedule_recurring` · `start_new_mission`

These are routed through the `executive` pseudo-department in `executeToolCall` (§16 API route) so the founder sees Orc do the work, even though the gateway handles the mechanics.

`make_changes`, `generate_companion`, and `draft_followup` route to the originating department (or a relevant one) because they require domain expertise and skills loading.

### Surfacing — where the founder sees suggestions

Suggested actions appear in **four** surfaces, not just the chat completion message:

1. **War Room completion message** — Orc's chat reply on mission completion shows 2–3 chips inline (the Beat 9 magic moment in §2). This is the discovery surface.
2. **Artefact card** — every artefact card in the Artefacts dashboard surfaces its `suggested_actions` as persistent chips below the preview. The founder can return to last week's pitch deck and still see "Send to my email" and "Schedule recurring".
3. **Mission Report** — the Mission Report renders its `suggested_actions` in a "What next?" section. Mission Reports are revisitable, so suggestions stay actionable.
4. **Dashboard "What next?" widget** — a single dashboard tile aggregates the top 3 unresolved suggestions across all recent missions and artefacts, ranked by recency × Orc's reasoning confidence. This is the "Orc keeps the work moving even when the founder isn't chatting" principle from §1 made concrete.

### Lifecycle and dismissal

- A suggestion stays in `suggested` state until tapped, dismissed, or expired.
- Founders can dismiss with a × on any chip; dismissed suggestions move to a "Dismissed" history list (recoverable for 30 days).
- Suggestions auto-expire after 14 days. The reasoning: stale suggestions clutter the dashboard and erode trust.
- Completed suggestions remain visible on the source artefact/Mission Report as a record ("Sent to founder@example.com on Apr 22"). They count as part of the artefact's audit trail.

### Generation rules

When a department or Orc completes a task, it **must** emit a `suggested_actions` array (may be empty). Orc reviews and dedupes before surfacing. Generation rules:

- **Always include** `make_changes` and `add_to_memo` — these are universal next steps.
- **Conditionally include** `send_to_email` if the artefact is shareable (PPTX, DOCX, PDF, XLSX, image).
- **Conditionally include** `save_to_kb` if the artefact wasn't auto-saved already.
- **Conditionally include** `schedule_recurring` if the mission type supports periodic regeneration (sales pipeline summary, weekly competitor check, monthly metrics report).
- **Department-specific** suggestions are emitted by the department itself (e.g. Marketing might suggest `generate_companion: "social_post_draft"` after a pitch deck).
- Cap the chip count visible in the War Room to **3**. The full list is always available on the artefact card and Mission Report.

### Why this matters for the product

This section is what closes the gap between "Crost generated a thing" and "Crost runs my company". Without persistent, executable, HITL-respecting next actions, every mission ends in a dead-end and the founder has to re-prompt to continue. With them, Orc's intelligence accumulates over the founder's working session — every output becomes a launchpad for the next one.

---

# 7. Mission Reports

Mission Reports replace post-mortems. They are the readable memory of work completed inside Crost.

A Mission Report explains: what the mission was, which departments were involved, which outputs were created, which approvals were requested, what succeeded, what failed, and what should happen next.

Mission Reports are written for **successful, failed, and partial-completion** missions. They are accessible from the Memo, the artefact detail view, and the Inbox. Event type emitted: `goal_mission_report_written`.

Every Mission Report includes a **Sources** section listing every Memo entry, KB file, and tool call referenced during the mission.

Every Mission Report also includes a **Suggested Next Actions** section (per §6.1) rendering the SuggestedAction rows whose `source_entity = { type: "mission_report", id: <this report> }`. The same chips surfaced in the War Room completion message appear here as a permanent record — tapping a chip from a Mission Report behaves identically to tapping it in the War Room (routes through HITL per §11, updates the shared SuggestedAction row).

The term "Mission Report" is canonical and replaces all earlier names ("Orc Report", "Post-mortem", etc.).

---

# 8. The Memo

The Memo is Crost's structured memory of the company. It is the **single source of truth for company state.**

## Storage

PostgreSQL (Supabase). Structured columns plus append-only logs.

## Structure

```
CompanyMemo = {
  company_profile: {
    name, industry, location, description
  },
  active_goals: [],
  strategies: [],
  task_logs: [],
  artefact_references: UUID[],   // references only, never raw file content
  decisions: [],
  department_notes: { [slug]: ... }
}
```

## Rules

- Every task **must** read from the Memo before executing.
- Every task **must** write back to the Memo on completion.
- Orc re-reads the Memo before every important decision.
- The Memo stays concise and useful. It is not a dump of raw data — long content goes to Artefacts (§9) and the Memo holds the reference.
- Two tables coexist: `company_memo` (singular, structured per the schema above) is the source of truth; `company_memos` (plural, the legacy chat/log table) remains for chat history and per-department notes. New writes prefer the structured `company_memo`. (See `MEMOS_VS_ARTIFACTS_ANALYSIS.md` for the migration plan.)

The founder should feel like Crost remembers context over time.

---

# 9. Artefacts

Artefacts are generated outputs. Examples: documents, presentations, spreadsheets, PDFs, images, reports.

## Storage strategy

- Files live in **Supabase Storage** (`artifacts` bucket).
- The DB stores **metadata only**.
- The Memo stores **references only** (UUIDs in `artefact_references`).

## Artefact schema

```
Artefact = {
  id: UUID
  type: "document" | "spreadsheet" | "image" | "data" | "code" | "presentation" | "pdf"
  title: string
  file_url: string                // Supabase Storage public URL — REQUIRED
  preview_url: string | null      // for in-browser preview thumbnails
  goal_id: UUID | null
  task_id: UUID | null
  department_slug: string
  skills_used: string[]           // e.g. ["pptx", "pitch_deck"]
  sources: {
    memo_ids: UUID[],             // Memo entries that informed this artefact
    kb_file_ids: UUID[],          // KB files referenced
    tool_calls: object[]          // external tool calls (Gmail searches, etc.)
  }
  suggested_actions: UUID[]       // FK → suggested_actions.id (see §6.1)
  created_by: UUID
  created_at: timestamp
  metadata: JSONB                 // tool name, source, size, etc.
}
```

## Rules

- Long outputs (>1200 chars) → Artefact, not Memo.
- Downloadable content → Artefact.
- Memo stores only references, never raw file content.
- Every artefact is tied to a mission and a creating department.
- `body` text fields on Artefacts are **deprecated**. New artefacts must have `file_url` populated.
- Artefacts must be previewable in-browser before download (§2 Beat 10).
- **Citations are non-negotiable.** Every artefact populates the `sources` field. The UI surfaces citations as a "Sources" footer on the artefact card and inside the file itself where the format supports it (e.g., DOCX footnote section, PPTX final slide).
- **Every artefact carries Suggested Next Actions** (§6.1). On creation, the producing department (or Orc for assistant-style outputs) generates the initial SuggestedAction rows and links their IDs into `suggested_actions`. The artefact card renders them as tappable chips; tapping routes through HITL per §11.

## MVP supported types

Documents (`.docx`, `.md`, `.txt`), Spreadsheets (`.xlsx`, `.csv`), Presentations (`.pptx`), PDFs (`.pdf`), Images (`.png`, `.jpg`).

## Quality bar

The first artefact a founder sees defines whether they come back. It must:

- Look useful at a glance.
- Be easy to review.
- Create a reason to come back.
- Be cited so the founder can trace where it came from.

This quality bar is what makes the **Skills layer** (§9.5) part of MVP, not future work.

## 9.5 Skills Layer (MVP)

Skills are reusable folders of best practices and code patterns that hardened experience producing a specific output type. Departments load relevant skills at task start.

### Concept

A Skill is **not** a tool, **not** a plugin, **not** a marketplace item (yet). It is an internal abstraction that bundles:

- A `SKILL.md` describing how to produce high-quality output of a specific type.
- Optional helper code (e.g., a Python module that uses `python-pptx` correctly).
- Worked examples and anti-patterns.

The model loads the skill *before* generating output, so production quality is consistent across departments and tasks.

### MVP Skill set

| Skill | Purpose |
|---|---|
| `pptx` | Produce well-formatted PowerPoint files (margins, hierarchy, theme tokens). |
| `docx` | Produce clean Word documents (TOC, headings, page numbers, footnotes for citations). |
| `xlsx` | Produce real spreadsheets with formulas, formatting, and chart support. |
| `pdf` | Produce PDFs and read/extract from existing PDFs. |
| `pitch_deck` | Meta-skill: composes `pptx` to produce founder-grade pitch decks (problem, solution, market, traction, team, ask). |

### Skill loading

Departments declare the skills they may use. At task time, the Execution Engine loads the relevant `SKILL.md` content into the department prompt before the LLM call. Skills live at `frontend/lib/skills/<skill_slug>/SKILL.md` (or equivalent path; engineering finalizes during build).

### Skill rules

- Skills are **internal**. Founders do not see skill names or invoke them directly.
- Skills are **deterministic-friendly**: where a Python helper exists (e.g., `pptx-helper.py`), the model is instructed to call it rather than emit raw XML.
- Skills are **versioned**: `skills_used` on every artefact records which skill versions produced it, so we can A/B improvements.
- Skills are **citation-aware**: skill prompts include instructions to populate the artefact's `sources` field.

### Why MVP, not fast-follow

The first artefact is the moment of conversion. A weak first artefact loses the founder regardless of how clever Orc is. Skills are the lever that makes the first artefact reliably good. They are also cheap to build (~3–5 days for the 5 starter skills) and the architectural pattern is already well-understood from Anthropic's own skill system.

### Future Skills (post-MVP, §16)

`outreach_plan`, `customer_persona`, `competitive_analysis`, `gtm_strategy`, `process_doc`, `meeting_notes`, `financial_model`, `legal_brief`, `email_draft`, plus marketplace-driven custom skills. See §16.5.

---

# 10. Knowledge Base

The Knowledge Base is the founder-controlled document store. It gives Orc and departments direct access to company context without polluting the Memo.

## Difference between the three stores

- **Memo** = active, distilled company state (current goals, strategies, decisions).
- **Knowledge Base** = static founder context (uploaded documents, research, references).
- **Artefacts** = task outputs (generated files, reports, models).

## Storage

- Files: Supabase Storage bucket `knowledge-base`.
- Metadata: `knowledge_base_files` table (RLS-secured per user).
- Chunks: `knowledge_base_chunks` table (cascade-deletes with parent file).

## File object

```
KnowledgeBaseFile = {
  id: UUID
  created_by: UUID
  title: string
  file_name: string
  file_type: string
  mime_type: string
  file_size: integer
  storage_path: string
  file_url: string
  category: "company_profile" | "pitch_deck" | "financial_report" | "handbook"
          | "meeting_notes" | "research" | "legal" | "marketing" | "sales"
          | "product" | "operations" | "custom"
  tags: string[]
  upload_status: "uploading" | "uploaded" | "failed"
  processing_status: "pending" | "processing" | "completed" | "failed"
  extracted_text: text          // first 50k chars
  extracted_summary: text
  extracted_metadata: JSONB
}
```

## Extraction pipeline

1. Founder uploads via `/dashboard/knowledge`.
2. `POST /api/knowledge/upload`:
   a. Validate MIME + size (max 25 MB).
   b. Insert pending row in `knowledge_base_files`.
   c. Upload file to Supabase Storage.
   d. Return immediately — extraction is async.
3. Async extraction via `lib/knowledge/extract-text.ts`:
   - PDF → `pdf-parse` (local) → LLM Vision fallback if <300 chars.
   - DOCX → `mammoth` (local) → LLM Vision fallback.
   - XLSX/CSV → `xlsx` (local).
   - TXT/MD/JSON → native UTF-8.
   - Images → LLM Vision always.
4. LLM summarization + tag generation via LiteLLM (respects BYOK).
5. Text chunked into ~800-char segments → `knowledge_base_chunks`.
6. **Future (Phase 3):** pgvector embeddings on each chunk for true semantic search.

## Retrieval

Internal tool: `knowledge_base_search`.

- Registered in `available_tools` with `risk_level = 'low'`.
- Intercepted natively in `executeToolCall` gateway (not via Composio).
- Returns concise summaries and semantic chunks to Orc/departments.
- Search modes: keyword, category filter, file type.
- **All retrievals populate the calling artefact's `sources.kb_file_ids`** (§9).

## Rules

- Files are strictly per-user (RLS: `created_by = auth.uid()`).
- Max 25 MB per file.
- Supported types: PDF, DOCX, XLSX, CSV, TXT, MD, JSON, PNG, JPG, WEBP, GIF.
- Upload response is immediate; extraction runs asynchronously.
- Orc reads the KB via `knowledge_base_search` — never raw file bytes.

## MVP scope for KB

Drop-in upload + raw text extraction (no Vision fallback, no chunking) is the **minimum** that ships in MVP. Vision fallback, chunking, and pgvector are post-MVP. (See §17 MVP Scope.)

---

# 11. Inbox & Approvals

The Inbox is where founders review notifications, approval requests, important updates, and pending actions.

Approvals are embedded into the Inbox experience. Nothing external happens without approval.

## Examples requiring approval

Sending email · Posting to Slack · Pushing to GitHub · Editing CRM data · Publishing content · Connecting external systems · Calendar invites · Data deletion · File exports.

## HITL Approval Protocol (engineering contract)

When a department receives a task that requires external action, it **must** output a `REQUEST_APPROVAL` block before taking any action. This block is injected into the department prompt by `buildFinalPrompt()` under the HITL APPROVAL PROTOCOL section.

```
REQUEST_APPROVAL: {
  "action_type": "<category>",
  "action_label": "<human-readable description>",
  "reasoning": "<why this action is needed>",
  "payload": { <execution parameters> },
  "context": "<context for founder review>"
}
```

The department task route (`extractApprovalRequest`) parses both `REQUEST_APPROVAL:` and the legacy ` ```json { "request_approval": true } ``` ` format.

## Approval queue

- Rows inserted into `approval_queue` with `created_by = userId` for RLS compliance.
- Real-time subscription in `RealtimeProvider` drives `pendingApprovalCount` in Zustand.
- Bell badge in Topbar shows red count; `NotificationDropdown` lists pending items.
- Approving via `/api/approvals/[id]` executes the queued action (Composio or internal).
- **Suggested Next Action chips (§6.1) flow through this same queue.** When the founder taps a chip whose `risk_level` exceeds the current Risk Mode threshold, the gateway inserts an `approval_queue` row, sets `SuggestedAction.status = "approved"` only on confirm, and links `SuggestedAction.approval_id` to the queue row. Chips below the threshold execute directly (status: `tapped → executing → completed`) but still emit an event for the audit log. There is exactly one approval surface; chips never bypass it.

## Risk mode (founder setting)

Set during onboarding (Screen 2 — Control Style):

- **Careful** → all actions require approval.
- **Balanced** *(default)* → low-risk actions auto-execute; medium/high/critical require approval.
- **Aggressive** → low + medium auto-execute; high + critical require approval.

The founder can change this anytime in Settings → Control Style.

## Verification rule (canonical)

| Auth path | OTP / verification | Can run missions? |
|---|---|---|
| Google OAuth | Not required (provider-verified) | Immediately |
| Apple OAuth | Not required (provider-verified) | Immediately |
| Email/password (fallback) | **OTP required before any action** | Only after verifying inbox link |

This is non-negotiable. Spam abuse and free-tier quota waste are both real risks for unverified email-only accounts.

## Founder trust copy

> "Crost never performs external actions without your approval."

This sentence is the trust contract. It appears in the marketing site, in the onboarding control-style screen, and in the Settings → Control Style page.

---

# 12. Tool Connections

Tool connections let Crost interact with external systems. **Composio** is the connection layer for MVP. (Nango was evaluated and archived — see Appendix A.)

## MVP tool set

Gmail (full priority — required for the simulation's "send to my email" magic moment).

Post-MVP tools, in priority order: Calendar, Slack, Notion, GitHub, HubSpot, Linear.

## Behaviour rules

- Tool requests are introduced **contextually** by Orc, never bulk-asked during onboarding.
- Example copy: *"To send this I need access to your Gmail. Want to connect now?"*
- One-click connect → OAuth via Composio → return to the surface where the request originated.
- Each tool action runs through the `executeToolCall` gateway, which routes to either Composio or an internal handler (e.g., `knowledge_base_search`).
- All external tool calls are subject to HITL approval per §11.
- Every tool call writes to the calling artefact's `sources.tool_calls` (§9).

## UI

- **Settings → Integrations** lists all available tools with Connected / Not Connected status.
- Activity Feed surfaces missing-connection events: *"⚠️ Marketing needs Gmail to send the deck — Connect."*

---

# 13. Dashboard Structure

The dashboard remains usable even while missions are running.

## Core areas

- War Room (§14)
- Memo
- Artefacts
- Inbox
- Knowledge Base
- Departments
- Settings

## Empty-state copy (canonical)

| Surface | Copy |
|---|---|
| War Room | "Start your first mission" / "Ask Orc anything about your company" |
| Artefacts | "Your generated files will appear here" |
| Knowledge Base | "Upload documents Orc can reference later" |
| Inbox | "Nothing needs your attention right now" |
| Memo | "Crost will automatically build memory as you work" |
| Departments | "Activate specialist teams when you need them" |
| Settings | "Control integrations, keys, models, and preferences" |

The dashboard never feels empty. Even for brand-new users, it shows: suggested first mission, onboarding summary, selected departments, live events, placeholder artefacts, helpful empty states.

---

# 14. War Room

The War Room is the founder's primary workspace.

The War Room is where founders talk to Orc, missions are created, live progress is shown, departments are activated, tool requests appear, and follow-up work happens.

It must feel **fast, alive, useful, easy to understand.**

The founder should never feel like they are talking to multiple disconnected systems.

---

# 15. System Architecture (Engineering Canon)

This section is the engineering source of truth. Where it disagrees with prior specs, this section wins.

## 15.1 Component map

```
Founder (Human)
    ↓
Orc (Chief of Staff / Strategist)
    ↓
Execution Engine (stateless orchestration)
    ↓
Departments (dynamic, per departments table)
    ↓ (loads relevant skills at task start)
Skills Layer (§9.5)
    ↓
Outputs (Memo, Artefacts with citations, Mission Reports, KB references)
```

## 15.2 Execution Engine

A stateless orchestration layer that:

- Reads the Memo.
- Receives tasks from Orc.
- Loads relevant Skills (§9.5) for the task type.
- Routes tasks to models (§15.3).
- Executes tasks.
- Writes outputs back to system (Memo, Artefacts with citations, approval_queue).

Components: Context Builder · Skill Loader · Model Router · Task Runner · State Writer.

## 15.3 Model Routing (multi-model)

| Tier | Use case |
|---|---|
| Tier 1 | Strategy, reasoning |
| Tier 2 | Execution |
| Tier 3 | Formatting |

```
function selectModel(task) {
  if (task.type === "planning")   return HIGH_REASONING_MODEL
  if (task.type === "execution")  return FAST_MODEL
  if (task.type === "formatting") return ULTRA_FAST_MODEL
}
```

## 15.4 BYOK (Bring Your Own Key)

Users can provide keys for the following canonical providers:

| Provider | Slug | LiteLLM prefix |
|---|---|---|
| Google | `gemini` | `gemini/` |
| Anthropic | `anthropic` | `anthropic/` |
| Groq | `groq` | `groq/` |
| OpenAI | `openai` | `openai/` |

Provider slugs `'claude'` and `'google'` are **deprecated** — use `'anthropic'` and `'gemini'`. OpenAI is in the canonical list for future readiness; not enabled in MVP per §16.

### Key resolver — exactly one key per LLM request, never merge

```
if (isBootstrap)           → system key (always)
if (no userId)             → system key
if (user has valid BYOK)   → user key
else                       → system key fallback
```

- User keys are passed via `body.api_key` to LiteLLM (key-passthrough mode). **Never** via `extra_body.api_key`.
- System key: `LITELLM_MASTER_KEY` in the Authorization header.
- LiteLLM virtual key management is **not** used. Key passthrough only.

### Bootstrap calls

Bootstrap = onboarding inference only. Includes: company profiling, competitor inference, initial strategy suggestion. Bootstrap calls always use the system key and are exempt from usage limits. Does **not** include first goal execution or background tasks.

### Concern separation

- `ApiKeysSettings` → stores and validates API keys → writes to `user_api_keys`.
- `ModelAssignmentForm` → assigns models to roles → writes to `user_model_assignments`.
- These are separate pathways. `ModelAssignmentForm` MUST NOT store or manage API keys.

## 15.5 Free tier & usage limits

- **Per user, per day:** `FREE_SYSTEM_DAILY_TOKENS` tokens (default 50,000), system-key calls only. Resets midnight UTC.
- **First-goal exemption:** a user with zero prior system-key usage bypasses the daily limit once.
- **Hard fail on limit:** return `"Free usage limit reached. Please add your API key to continue or wait till your limit resets."` with `resetAt` (ISO timestamp). Do not queue or silently retry.
- **Logging:** every LLM call writes one row to `api_usage_logs` (billing). This is **separate** from `event_log` (system events). New function `logUsage()` — do not overload `logEvent()`. Skip logging when `userId` is null. Cost is estimated from a static pricing table; LiteLLM is not a cost source.
- **Settings UI:** real progress bar (green <75%, amber 75–90%, red >90%). Shows "Resets at [local time]". If user has any valid BYOK key, shows: *"Using your API key — no system limit applies."*

## 15.6 Auth Bridge — Landing → App

Two separate deployments share a single Supabase instance, subdomain cookies, and user consent history.

### Phase 1 — Auth Bridge (MVP, ~5 hours)

1. Landing CTA: "Start Free" redirects to `https://app.crosthq.com/onboarding/identity?email=…&source=landing`.
2. App pre-fill: read `?email` and `?source`, populate the onboarding form.
3. Auto-claim: on signup, create a `user_consents` record if landing referral.
4. Cookie config: Supabase Auth Cookie Domain = `.crosthq.com`.
5. Analytics: track landing→app redirects + signup completion in PostHog.
6. E2E + edge case testing.

### Edge cases (must handle)

- **Duplicate email** → redirect to `/login`, not `/signup`.
- **Invalid email param** → ignore param, show empty form.
- **Missing consent** → show consent modal during onboarding; never auto-approve.
- **Cookie rejection** → fall back to email pre-fill only.
- **RLS violations** → `user_consents` policy must allow founder to insert own records.
- **Egress** → ~1–2 MB per 100 signups (negligible); monitor.

### Phase 2 — Full Consolidation (post-MVP, Q2 2026)

Triggered only if landing exceeds 10K visitors/month, design changes require landing↔app sync, or team capacity is available. Then port Crost Landing from Vite → Next.js, merge route groups, clean up `App.jsx`, etc.

## 15.7 Tool execution gateway

```
executeToolCall(departmentId, service, action, params, userId)
  ↓
  if (service is internal e.g. knowledge_base_search) → handle natively
  else                                                → route via Composio
  ↓
  if (action requires approval per risk_level)
      → insert into approval_queue, return { requires_approval, approval_id }
  else
      → execute, write Memo + event, append to caller's sources.tool_calls,
        return { success, result }
```

Outcomes the gateway can return:

- `{ success, result }`
- `{ requires_approval, approval_id }`
- `{ missing_connection, service }` → triggers contextual connect prompt
- `{ error, message }`

**Suggested Next Action entry point.** The gateway is also the execution layer for §6.1 chip taps. A chip tap calls `executeSuggestedAction(suggestedActionId, userId)` which:

1. Loads the `SuggestedAction` row and validates `status ∈ { "suggested", "tapped" }`.
2. Resolves `required_tool` and the `action_slug` → `(service, action, params)` mapping (see catalog in §6.1). Direct-action slugs (per §6.1 "Orc's direct-action set") route through `departmentId: 'executive'`; department-owned slugs route to their owning department.
3. Calls `executeToolCall(...)` with the resolved arguments.
4. Threads every outcome back into the `SuggestedAction` row: approval → `status: "approved"`, `approval_id: ...`; success → `status: "completed"`, `result_artefact_id: ...`; error → `status: "failed"` with the error written to `event_log`. Emits `suggested_action_*` events at each transition.

This keeps chip taps, `@dept` messages, `/tool` invocations, and department-internal tool calls on a single code path. No parallel execution surfaces.

## 15.8 Data model overview (MVP-relevant tables)

- `users` (Supabase Auth)
- `user_consents`
- `user_api_keys`
- `user_model_assignments`
- `api_usage_logs` *(billing)*
- `event_log` *(system events — distinct from billing)*
- `system_config` (per-user kv: `local_identity`, `risk_tolerance`, `onboarding_step`, `onboarding_complete`)
- `company_profiles`
- `company_memo` (singular, structured — source of truth)
- `company_memos` (plural, legacy chat history — write-mostly, read for history)
- `departments`
- `goals`
- `tasks`
- `artifacts` (with `skills_used`, `sources`, and `suggested_actions` columns)
- `approval_queue`
- `suggested_actions` (per §6.1 — chip catalog rows; FK to `artifacts`/`tasks`/`goals` via `source_entity`, FK to `approval_queue` via `approval_id`, FK to `artifacts` via `result_artefact_id`)
- `connections` (Composio mapping per user/service)
- `knowledge_base_files`
- `knowledge_base_chunks`
- `available_tools` (catalog)
- `skills_registry` (skill slug, version, path, declared by which departments)

## 15.9 Visibility — what users see vs. don't

| Users see | Users do NOT see |
|---|---|
| Friendly strategy | Internal prompts |
| Task list (status only) | Raw model routing decisions |
| Artefacts with citations | Skill names, internal skill code |
| Clean Memo view | Low-level execution noise |
| Mission Reports with sources | Token usage internals (except in Settings progress bar) |
| Tool call results | Stack traces, raw API responses |

---

# 16. Interaction Modes

Crost supports three interaction modes from the War Room input:

- **No prefix** → Orc flow (default, planning + coordination).
- **`@<slug>`** → direct department message.
- **`/<service>.<action>`** → direct tool invocation via the gateway.

## Auto-complete menu (`ChatCommandMenu`)

Typing `@` or `/` opens a floating dropdown above the input:

- `@` mode: lists active departments (filtered by slug/name).
- `/` mode: lists built-in `TOOL_CATALOGUE` entries.
- `↑↓` to navigate, `↵` to select, `Esc` to dismiss.
- Idle hint in input header: *"@ dept · / tool"*.

## Routing logic

`parseInput()` classifies each submission:

- **department** → `POST /api/departments/[slug]/task { task: message }`
- **tool** → `POST /api/tools/invoke { service, action, params }`
- **orc** → existing `handleGoalSubmit()` flow (unchanged)

Tool responses surface all gateway outcomes: success, `requires_approval` (⏸ paused), `missing_connection` (⚠ connect in Settings), and errors.

## CommandThread

Inline `@dept` and `/tool` responses render in a `CommandThread` card below `GoalInput`:

- Color-coded prefix label (teal for `@dept`, violet for `/tool`).
- Raw input echoed in monospace.
- Streamed response text.
- × dismiss button (when not loading).

## API route

`POST /api/tools/invoke` — calls `executeToolCall()` with `departmentId: 'executive'`. Returns: `{ success, result } | { requires_approval, approval_id } | { missing_connection, service } | { error }`.

## UX rule

The system always makes it clear what is happening and why. The founder never has to read a prefix to understand a response — the response self-labels.

---

# 17. MVP Scope (Tightened)

This is the line. Anything not listed here is post-MVP (§18).

## In MVP

**The first-mission magic arc, end to end, with cited artefacts produced through the Skills layer.**

1. **Landing → Auth Bridge Phase 1** (§15.6).
2. **Auth:** Google OAuth (no OTP), Apple OAuth (no OTP), Email/password fallback (OTP required before any work). Verification rule per §11 table.
3. **Onboarding:** 4 screens + activation moment per `CROST_ONBOARDING_SPEC.md`, ~3 min budget.
   - Add the missing **"Meet Orc"** moment before department selection (§2 Beat 6).
4. **Orc + dynamic departments table.** Marketing, Sales, Operations, Engineering, Finance, Legal, Customer Support seeded.
5. **Suggested first mission** based on interpreted business category. Skip available.
6. **Mission execution:** Orc plans, departments execute through the Skills layer, real LLM calls, real Composio tool calls when approved.
7. **Skills Layer (§9.5):** 5 starter skills shipped — `pptx`, `docx`, `xlsx`, `pdf`, `pitch_deck`.
8. **Artefacts in Supabase Storage** with `file_url` populated, `skills_used` recorded, and `sources` populated. **In-browser preview** before download. **Citations surfaced** in artefact card and inside the file where format permits.
9. **Mission Reports** auto-written on completion with Sources section.
10. **War Room** with three interaction modes (`@dept`, `/tool`, plain).
11. **HITL approval queue** with `REQUEST_APPROVAL` protocol, real-time subscription, bell badge.
12. **Composio integration** with **Gmail** as the only required tool (Calendar a stretch goal).
13. **BYOK** (Gemini, Anthropic, Groq) + free tier daily quota with first-goal exemption.
14. **Knowledge Base — minimum:** drag-and-drop upload, raw text extraction (PDF/DOCX/XLSX/CSV/TXT/MD/JSON), `knowledge_base_search` tool. **No Vision fallback. No chunking. No vector search.**
15. **Mobile placeholder listing:** App Store + Play Store "coming soon" pages capturing email (§2 Beat 12).

## Out of MVP (deferred to §18 roadmap)

- Sub-agents within departments (Head of Department + specialist agents).
- Scheduled missions (cron-style).
- Memo consolidation background job.
- setup-crost guided onboarding (rebuild as Orc-led flow).
- Plugin namespacing infrastructure (design now, build later).
- Contacts.
- Dispatch (mobile app proper).
- Marketplace.
- Autonomous mode.
- Local mode (Ollama).
- Auth Bridge Phase 2 (full consolidation).
- KB Vision fallback, chunking, pgvector embeddings.
- OpenAI provider (canonical slug exists; not wired).
- Per-department / per-task model overrides UI.
- Multi-user collaboration.
- Skills marketplace and additional Skills (`outreach_plan`, `customer_persona`, etc.).

## Cut from MVP entirely (do not build)

- Auto-retry loops.
- Complex agent hierarchies (the simple Head + sub-agent pattern in §16.4 is fine post-MVP; multi-level meta-agent stacks are not).
- Code execution sandbox.
- Real-time collaboration infrastructure.
- Excessive gamification.
- Multiple competing assistants.
- Structured multiple-choice question surfaces (Orc converses; it does not present forms).

## Definition of Done (MVP)

Run this end-to-end with a fresh founder account. All must pass:

1. Landing → app email pre-filled.
2. Email/password signup blocks at OTP screen until inbox is verified. Google/Apple OAuth signup proceeds straight through.
3. Onboarding completes in under 4 minutes.
4. Orc is introduced before department selection.
5. Suggested first mission produces a real artefact via the Skills layer.
6. Artefact has `skills_used` populated and a non-empty `sources` field.
7. Artefact is previewable in-browser before download.
8. Artefact card shows a Sources footer listing Memo entries and KB files used.
9. Founder asks to send the artefact to email; Gmail OAuth completes in ≤2 clicks; email arrives.
10. Mission Report appears in the Memo and Inbox with a Sources section **and a Suggested Next Actions section** (per §6.1).
11. **Suggested Next Action chip-tap end-to-end:** the artefact card shows at least 3 chips with valid `action_slug` values from the §6.1 catalog. Tapping `send_to_email` executes through the gateway, surfaces the HITL approval (or auto-executes per Risk Mode), succeeds, and updates the SuggestedAction row to `status = "completed"` with `result_artefact_id` populated when the action produced a new artefact (e.g., the sent-email receipt).
12. BYOK key entry replaces system-key usage on next call.
13. Free quota progress bar reflects real usage.
14. Knowledge Base upload + search returns relevant chunk; calling artefact's `sources.kb_file_ids` is populated.
15. App Store / Play Store placeholder captures email.

---

# 18. Founder Decisions (Locked)

Each decision below is now resolved. ✅ = accepted as-recommended. 🔁 = override applied. The body of each entry reflects the final ruling.

## ✅ Decision 1 — Orc as the office assistant

**Ruling:** Orc handles assistant-style requests directly ("send to my email", "remind me later", "save this") with no second assistant entity.

**Rationale:** Founders should not have to memorize multiple assistant names. The simulation answered itself: *"Orc is just their go to person."* Internally we route assistant actions through an `executive` pseudo-department in the tool gateway (§16 API route), but to the founder, Orc did it.

## 🔁 Decision 2 — Skills layer (in MVP)

**Ruling:** Skills layer ships in MVP, not as a fast-follow.

**Rationale (override):** Skills are the lever that makes the first artefact reliably good. A founder's conversion happens at the moment they first see what Crost produced for them — a weak first PPTX loses them no matter how clever Orc was. Skills are also cheap (~3–5 days for the 5 starters) and the architectural pattern is well-understood. Adding them to MVP is the right call. See §9.5 for the implementation.

**Starter skills:** `pptx`, `docx`, `xlsx`, `pdf`, `pitch_deck`.

## ✅ Decision 3 — Contacts

**Ruling:** Post-MVP. Build when median founder has >5 unresolved contact decisions in their Memo.

**Rationale:** Contacts are the right long-term primitive but require schema, UI, and resolution logic that don't justify the MVP cost. The Memo's `decisions` array can hold contact resolutions in the meantime as `{contact: "Sarah", resolved_to: "sarah@…"}` entries.

## ✅ Decision 4 — Dispatch (mobile)

**Ruling:** Placeholder App Store + Play Store listings ship in MVP; full Dispatch ships within 90 days of MVP launch.

**Plan:**
- **MVP:** "Crost Dispatch — Coming Soon" listings with email capture.
- **MVP+30:** Decide React Native (Expo, recommended) vs. native; allocate one designer + one mobile engineer.
- **MVP+60:** Build voice notes, image upload, text instructions, push notifications, quick approvals, live mission updates.
- **MVP+90:** Ship Dispatch v1.

**Rationale:** The simulation ended with the founder going to the App Store. Every week of delay is a week of muted referrals.

## ✅ Decision 5 — Processing copy

**Ruling:** Adopt the expanded canonical list (§2 Beat 8). Office-themed and warm-playful variants only. Edgy/weapons language permanently banned. The product owner reviews any new processing copy before it ships.

## 🔁 Decision 6 — Verification gate

**Ruling:** OAuth signups (Google or Apple) proceed with no OTP — the provider has already verified ownership. Email/password signups are OTP-required *before any work happens*; the founder cannot enter onboarding until they have verified their inbox link. Email/password is the **fallback** path; OAuth is the default.

**Rationale (override):** Spam abuse and free-tier quota waste are real. Anyone who can't be bothered to verify an email is not a serious user. Marketing copy positions OAuth as the no-friction path so the funnel naturally pushes founders away from email/password. See §11 verification rule and §17 DoD #2.

## ✅ Decision 7 — Aggressive risk mode threshold

**Ruling:** Aggressive auto-executes low + medium risk actions; high and critical always ask. Matches the threshold table in `CROST_ONBOARDING_SPEC.md` Screen 2.

---

# 19. Cowork Alignment Notes

> **For pitch deck and team strategy alignment.** This section captures how Crost relates to Anthropic's Cowork product. It is not a build directive — it is a positioning lens and a source of pattern inspiration.

## The strategic analogy

> **Crost is the operating layer for your company, the way Cowork is the operating layer for your computer.**

Cowork helps an individual operate their computer — files, apps, MCPs, scheduled tasks. Crost helps a founder operate a company — strategy, departments, missions, artefacts. The product surfaces are different, but the architectural primitives have converged. That convergence is a strong signal: when two independent products built for different problems arrive at the same primitives, those primitives are the right ones.

Crost is **not** a Cowork wrapper, a Cowork plugin, or a Cowork extension. Crost is its own product solving its own problem. The alignment is conceptual, not technical.

## Shared primitives (confirmations)

The following patterns exist in both Cowork and Crost, and the team should treat their convergence as validation that we are on the right architectural track:

1. **Single intelligent layer.** Cowork is one Claude doing everything; Crost is one Orc coordinating everything. We deliberately reject the "multiple competing assistants" pattern.
2. **Skills as a first-class abstraction.** Both products use folders of best practices loaded at task time to harden output quality. Skills are not plugins, not marketplace items — they are an internal quality lever.
3. **HITL for external actions.** Both products gate every external action behind explicit user approval. Cowork uses `request_access`; Crost uses `REQUEST_APPROVAL`. Same primitive, different surface.
4. **Tiered risk levels.** Cowork has read/click/full access tiers per app; Crost has low/medium/high/critical risk levels per action. Both let the user set tolerance once and trust the system to apply it consistently.

## Patterns Crost should adopt (folded into roadmap)

| Cowork pattern | Crost adoption | Where in spec |
|---|---|---|
| `schedule` skill (recurring tasks) | **Scheduled Missions** | §16 — MVP+30 fast-follow |
| `consolidate-memory` skill | **Memo Consolidation background job** | §16 — post-MVP weekly job |
| Subagents (Task tool) | **Head of Department + specialist sub-agents** within each department, post-MVP. *This is also how real companies operate.* | §5 (future structure), §16 |
| Plugin namespacing (`plugin:skill`) | **Crost marketplace uses namespaced slugs from day one** to avoid retrofit cost | §16, post-MVP marketplace work |
| `setup-cowork` guided flow | **setup-crost** — rebuild onboarding as an Orc-led conversational flow long-term | §16, post-MVP |
| Citation requirements | **MVP citations on every artefact** (`sources` field) | §9, §17 DoD #6 and #8 |
| File-creation triggers as heuristic | **Orc defaults to file output for substantive work** | §4 behavior rules |

## Patterns Crost deliberately rejects

| Cowork pattern | Why Crost rejects it |
|---|---|
| `AskUserQuestion` structured multiple-choice | A Chief of Staff has a conversation, not a form. Adding choice cards would dilute the CoS metaphor. Orc asks in prose. |
| Lazy-loaded tool schemas | Premature optimization for our scale. Also a "Cowork wrapper" signal we want to avoid. Revisit only if our tool catalog exceeds 50 entries. |

## What this means for marketing

The pitch can lean on the analogy without claiming a partnership or technical dependency:

> **Crost is to your company what Cowork is to your computer:** one intelligent layer that knows your context, coordinates the right specialists, and never acts without your approval. Where Cowork operates a desktop, Crost operates a startup.

This positioning works because:

- Anyone familiar with Cowork instantly understands Crost.
- Founders who do not know Cowork still hear the "operating layer for my company" framing, which is sticky.
- It clarifies what Crost is *not* (chatbot, task tracker, automation builder) by anchoring against a known product category.

## What this means for engineering

When designing a new primitive, check whether Cowork has solved an analogous problem. The answer may not apply directly, but the pattern usually does. Specifically:

- **Skills system:** mirror the `SKILL.md` + helper code pattern.
- **Approval queue:** mirror the per-action access request flow.
- **Background jobs:** mirror the scheduled-task pattern when building Scheduled Missions.
- **Memory hygiene:** mirror the consolidate-memory pattern when building Memo Consolidation.

When in doubt, study Cowork as a reference implementation and then build Crost's version for the company-operating-system domain. **We borrow the patterns, not the product.**

---

# Appendix A — Reconciliation Notes

This appendix documents where `CROST_SPEC.md` (product/UX-led, "April 20" rewrite) and `CROST_SPEC_1.md` (engineering-led, "v1.6") disagreed, and which side won.

| # | Topic | SPEC.md said | SPEC_1.md said | This spec says | Why |
|---|---|---|---|---|---|
| 1 | Approval contract | Soft principle: "external actions require approval" | Hard `REQUEST_APPROVAL` block format with payload schema | **Both.** Soft principle in §1, hard contract in §11. | Engineering needs the contract; product needs the principle. |
| 2 | Memo schema | Loose prose | Strict structure with `company_profile`, `active_goals`, `strategies`, `task_logs`, `artefact_references`, `decisions`, `department_notes` | **SPEC_1 wins** (§8). | Schema clarity beats prose. |
| 3 | Memo storage | Single Memo concept | Two tables (`company_memo` singular structured, `company_memos` plural legacy) per `MEMOS_VS_ARTIFACTS_ANALYSIS.md` | **Two-table reality** (§8). | Reflects shipped state. Migration path documented. |
| 4 | Artefact schema | Loose list of types | `id, type, file_url, task_id, created_by, created_at, metadata` | **SPEC_1 schema** + `body` deprecation, `file_url` required, **plus new `skills_used` and `sources` fields** (§9). | Resolves the artifact vs. memo conflation issue and locks citations. |
| 5 | Tool layer | "Composio is the current connection layer" | Composio with `executeToolCall` gateway, RLS, approval routing | **SPEC_1 wins.** Earlier "Crost MCP & Tooling v2.0.md" proposed Nango — archived. | Shipped reality is Composio. |
| 6 | Onboarding | Loose flow | Detailed 4-screen + activation moment (separate `CROST_ONBOARDING_SPEC.md`) | **Onboarding spec wins**, with the addition of the "Meet Orc" moment (§2 Beat 6). | Onboarding spec is more concrete and battle-tested. |
| 7 | Orc introduction | Implied | Implied | **New requirement** (§2 Beat 6, §17 DoD #4). | Surfaced by the founder simulation. Critical gap. |
| 8 | Mission Report terminology | "Mission Report" | "Mission Report" replaces older terms | **Mission Report is canonical** (§7). | Consistent across both. |
| 9 | Interaction modes | Mentioned briefly | Detailed `@dept` / `/tool` syntax | **SPEC_1 wins** (§16). | Implementation detail belongs to engineering spec. |
| 10 | BYOK | Not addressed | Full key resolver, bootstrap rules, concern separation | **SPEC_1 wins** (§15.4–15.5). | Not contested. |
| 11 | Auth bridge | Not addressed | Phase 1 (5h) + Phase 2 conditional | **SPEC_1 wins** (§15.6). | Not contested. |
| 12 | Knowledge Base | High-level | Full extraction pipeline, schema, retrieval | **SPEC_1 schema + tighter MVP cut** (§10, §17). | MVP needs only raw text extraction. |
| 13 | Skills system | Hinted in `Crost_Simulation.md` only | Not addressed | **MVP — 5 starter skills** (§9.5). | Founder override on Decision 2. Quality lever for first-artefact moment. |
| 14 | Contacts | Future | Not addressed | **Post-MVP with explicit trigger** (§18 Decision 3). | Decided. |
| 15 | Dispatch (mobile) | Future | Not addressed | **Placeholder in MVP, full app +90 days** (§18 Decision 4). | Highest-intent pull-through signal. |
| 16 | Processing copy | "Drawing strategy" / no military edge | Not addressed | **Expanded canonical list, edgy language banned** (§2 Beat 8, §18 Decision 5). | Founder explicit preference. |
| 17 | OpenAI provider | Not addressed | Listed in canonical slugs but excluded from MVP | **Excluded from MVP** (§15.4, §17 out-of-scope). | Consistent. |
| 18 | Risk mode thresholds | Not specified | Three modes, no threshold table | **Threshold table from `CROST_ONBOARDING_SPEC.md` Screen 2** (§11). | Onboarding spec is the only place with the actual mapping. |
| 19 | Verification rule | "No verification before onboarding" | "Verification later for sensitive actions" | **OAuth = no OTP. Email/password = OTP required before any work.** (§11, §18 Decision 6, §17 DoD #2). | Founder override on Decision 6. Spam reality. |
| 20 | Citations | Not addressed | Not addressed | **Non-negotiable in MVP. Every artefact has `sources`** (§9, §17 DoD #6, #8, #13). | Adopted from Cowork pattern. Trust-builder. |
| 21 | Sub-agents within departments | Not addressed | Not addressed | **Post-MVP** — Head of Department + specialists (§5, §16). | Adopted from Cowork pattern. Mirrors real company structure. |
| 22 | Doc voice | Founder-narrated ("Joy approves…") | Founder-narrated | **Anonymized** — "Crost leadership", "the founder", "the product owner". | Spec must be readable by any engineer who picks it up. |
| 23 | Suggested Next Actions | Implied in `Crost_Simulation.md` ("send to my email", "save it") but never formalized | Not addressed | **First-class primitive with full execution contract** (§6.1). `suggested_actions` table, 10-slug catalog, chip taps route through the same `executeToolCall` gateway + `approval_queue` as every other action. MVP. | The simulation's magic moments were chip taps without the plumbing. This locks the plumbing so the magic is reliable, not incidental. |

---

# Appendix B — Changelog (v2.0 → v2.1 → v2.2)

## v2.1 (from v2.0)

1. **§18 decisions all locked.** No more "Pending". Each decision has a clear ruling with rationale.
2. **Skills moved to MVP** with full §9.5 spec, 5 starter skills, schema additions to Artefacts (`skills_used`).
3. **Verification rule rewritten** to OAuth-bypass / email-OTP-required (§11 table, §17 DoD #2, §2 Beat 2).
4. **Citations non-negotiable in MVP.** New `sources` field on Artefact, Task, and Mission Report. New §9 rule. UI surfaces in artefact cards and inside files. Touched §1, §4, §6, §7, §9, §10, §12, §15.7, §15.8, §17 DoD.
5. **File-creation triggers added to §4** Orc behavior rules (Cowork-inspired heuristic).
6. **Doc voice anonymized.** No more references to "Joy" by name.
7. **Processing copy expanded** to a longer canonical list (§2 Beat 8) with both office-themed and warm-playful variants.
8. **§19 Cowork Alignment Notes added** — pitch-ready strategic positioning + roadmap-folding table + rejected-patterns table.
9. **Sub-agents within departments** added to post-MVP roadmap (§5 future structure, §16, Appendix A row 21).
10. **Scheduled Missions, Memo Consolidation, setup-crost, plugin namespacing** added to post-MVP roadmap (§17 out-of-scope, §16 implicit via §19 table).
11. **Reconciliation table extended** with rows 19–22 covering the new MVP-defining decisions.

## v2.2 (from v2.1)

The founder identified that the spec said "Orc suggests next steps" but never locked the execution path. v2.2 closes that gap with full robust execution.

1. **New §6.1 — Suggested Next Actions (canonical contract).** Inserted between §6 Missions and §7 Mission Reports. Locks: `SuggestedAction` schema, 10-slug canonical catalog (`send_to_email`, `send_to_contact`, `save_to_kb`, `make_changes`, `schedule_recurring`, `add_to_memo`, `generate_companion`, `share_with_teammate`, `draft_followup`, `start_new_mission`), execution contract diagram, Orc's direct-action set (Decision 1 enforcement via `executive` pseudo-department), four surfacing locations (War Room completion message, artefact card, Mission Report, dashboard "What next?" widget), lifecycle rules (14-day expiry, 30-day dismissal recovery), generation rules (always-include + conditionals, 3-chip cap on War Room).
2. **§7 Mission Reports updated** — Suggested Next Actions section now part of every Mission Report; chips behave identically to their War Room equivalents.
3. **§9 Artefact schema gains `suggested_actions: UUID[]` field** + a new rule that every artefact carries chips on creation. Card UI renders chips; taps route through HITL.
4. **§11 Approvals updated** — explicit statement that chip taps flow through the same `approval_queue` as every other action; `risk_level` on `SuggestedAction` interacts with Risk Mode the same way department actions do. One approval surface, no parallel paths.
5. **§15.7 Tool execution gateway extended** with `executeSuggestedAction()` entry point and the 4-step contract for threading outcomes back into the `SuggestedAction` row.
6. **§15.8 Data model overview** adds the `suggested_actions` table and notes the `suggested_actions` column on `artifacts`.
7. **§17 DoD adds chip-tap end-to-end test** (renumbered #11; subsequent items renumbered).
8. **Appendix A gains row 23** for the Suggested Next Actions decision.
9. **Doc version bumped** to v2.2 in the title.

---

# Final Note (Founder to Builder)

This system is not about automating tasks. It is about **augmenting decision-making at the company level.**

Every implementation decision must preserve **clarity, control, and founder trust.**

When in doubt, ask: *would the founder feel like Crost handled this for them?* If yes, ship it. If no, simplify.
