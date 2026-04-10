# Crost — Onboarding Build Specification
**Version:** 1.0 — Cloud-First MVP
**Feeds into:** `app/onboarding/` route in Next.js 14
**Dependencies:** Supabase Auth, system_config table, departments table, goals table, Orc v2
**Ground truth:** CROST_MASTER.md v2.0 takes precedence over all earlier specs

---

## Context and Constraints

### What is already built (do not rebuild)
- Orc v2 with dialogue mode, JSON plan output, and strategic synthesis
- Dynamic department routing (no hardcoded Sales/Marketing/Ops)
- Coherence blocks for workers
- Founder overrides on task labels/reasoning
- Post-mortem Orc Report on goal completion
- Migrations 1–14 applied including `dialogue_mode` and `orc_upgrade`

### Active constraints for this build
- **Cloud-only for now** — no Ollama/hardware check. The environment screen is removed entirely. It will be added back when local mode is tested.
- **BYOK** — founders provide their own API keys. No managed cloud billing in this build.
- **No tool connections during onboarding** — Gmail, Supabase connectors etc. are prompted contextually the first time an agent needs them. Onboarding must work end-to-end without any external tool being connected.
- **The activation moment must use Orc's existing dialogue + planning flow** — not a mock or demo. It must be a real Orc call that produces a real JSON plan.

### The single objective of this onboarding
A founder must go from blank to "my company is working on my first goal" in under 4 minutes, without touching any settings, connecting any tools, or reading any documentation.

---

## The Flow — 4 Screens + 1 Activation Moment

```
Screen 1: Identity         (~90 seconds)   — who you are and what you're building
Screen 2: Control style    (~15 seconds)   — how you want to operate
Screen 3: Pick your team   (~30 seconds)   — which departments to activate first
Activation moment          (~60 seconds)   — first goal, system comes alive
→ Dashboard loads already working
```

Total: under 4 minutes.

---

## Screen 1 — Identity

### Route
`/onboarding/identity`

### Purpose
Collect the minimum context Orc needs to be useful. Not a form — a conversation. Each answer is reflected back before the next question appears. The founder should feel heard, not processed.

### UI behaviour
Questions appear one at a time. The next question does not render until the current answer is submitted. Each answer is reflected back as a one-line interpretation before the next question fades in. The right panel builds a live summary as answers come in.

### The three questions

**Question 1**
```
Prompt:    "What's your name, and where are you building?"
Input:     Two fields: Name (text) | City, Country (text with autocomplete)
On submit: Reflect — "Hey [name]. Building in [city] — got it."
```

**Question 2**
```
Prompt:    "What does your company do?"
Input:     Free text, placeholder: "We help small retailers buy goods on credit..."
On submit: Send to Orc's interpretation endpoint (see API spec below).
           Reflect — Orc's interpreted category back to the founder.
           Example: "B2B credit infrastructure for informal retail. Noted."
           If Orc cannot interpret: "Got it — I'll learn more as we work."
```

**Question 3**
```
Prompt:    "What stage are you at?"
Input:     Four option pills — not a dropdown, not a form field.
           ○ Just starting    ○ Early MVP    ● Getting traction    ○ Scaling
On submit: No reflection needed. Advance immediately.
```

### Data written on completion
```typescript
// system_config rows — upsert all three
{ key: 'local_identity', value: {
    founder_name: string,
    city: string,
    country: string,
    business_description: string,       // raw founder input
    business_category: string,          // Orc-interpreted
    stage: 'starting' | 'mvp' | 'traction' | 'scaling'
  }
}

// Supabase Auth metadata
{ display_name: founder_name, onboarding_step: 'identity_complete' }
```

### Orc interpretation endpoint
```typescript
// POST /api/onboarding/interpret-business
// Body: { description: string }
// Returns: { category: string, confidence: 'high' | 'low' }

// Orc prompt (lightweight — no constitution, no corpus, single call):
const prompt = `
A founder described their business as: "${description}"
Respond with a single short phrase (max 8 words) that categorises this business.
Examples: "B2B SaaS for logistics teams", "Consumer fintech for gig workers",
"B2B credit infrastructure for informal retail", "D2C fashion brand".
Return ONLY the phrase. No punctuation, no explanation.
`
// If LLM call fails or times out: return { category: description, confidence: 'low' }
// Never block onboarding on this call.
```

### Design notes
- Background: `#0c0c0f` — warmer dark than the dashboard, signals "setup" not "operation"
- Headlines: Fraunces serif — editorial, warm, different from the dashboard
- Reflection blocks: teal left border (`#1D9E75`), DM Mono font, subtle teal-tinted background
- Right panel: builds a live "your profile" card as answers come in — name, location, business, stage
- Progress: show estimated time remaining ("~3 min left") not a progress bar with steps

---

## Screen 2 — Control Style

### Route
`/onboarding/control`

### Purpose
Set the founder's operating style. This single choice sets `risk_tolerance` in system_config which controls approval thresholds across every department and Orc's interruption frequency. It should feel like choosing a management philosophy, not configuring software.

### UI behaviour
Three options presented as cards, not a dropdown or radio buttons. Each card has a short description of what changes. `Balanced` is pre-selected. Founder clicks one and advances immediately — no separate "Next" button.

### The three options

```
┌─────────────────────────────────┐
│ Careful                         │
│ Ask before most actions.        │
│ Best for high-stakes decisions  │
│ or early-stage founders.        │
└─────────────────────────────────┘

┌─────────────────────────────────┐  ← pre-selected
│ Balanced                        │
│ Approvals on high-stakes only.  │
│ Good default for most founders. │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ Aggressive                      │
│ Move fast, fewer interruptions. │
│ Best when speed matters most.   │
└─────────────────────────────────┘
```

Below the cards, one line:
```
You can change this anytime in Settings → Control Style.
```

### Data written on completion
```typescript
// system_config row
{ key: 'risk_tolerance', value: 'careful' | 'balanced' | 'aggressive' }

// Maps to approval thresholds:
// careful:    low=approve, medium=approve, high=approve, critical=approve
// balanced:   low=auto,    medium=approve, high=approve, critical=approve
// aggressive: low=auto,    medium=auto,    high=approve, critical=approve
```

### Design notes
- This screen is intentionally minimal — one question, one click, done
- Do not add API key input here (Advisor 1's Key Vault). API keys go in Settings.
- Do not add constitution signing here. Constitution is always enforced; showing it in onboarding creates unnecessary friction. A one-line note is sufficient: "Your team operates under the Crost Constitution — agents never act without your sign-off on anything irreversible."

---

## Screen 3 — Pick Your Team

### Route
`/onboarding/team`

### Purpose
The founder selects which departments to activate first. This prevents an empty dashboard and immediately makes the product feel purposefully configured for them.

### Critical rule
Departments shown here are pulled dynamically from the `departments` table where `activation_stage = 'active'` and `is_orchestrator = false`. Do NOT hardcode the department cards. This honours the existing dynamic department routing architecture from CROST_MASTER Phase 1.

### UI behaviour
A card gallery. Founder selects 2–3 (enforced minimum 2, maximum 3 for the activation moment to work well). Each card has a name, a one-line description, and the default model (local/cloud). A subtle tick appears on selection. A "Start with these" button activates at 2+ selections.

### Department card format
```
┌──────────────────────────────────────┐
│  Sales                               │
│  ─────────────────────────────────   │
│  Finds leads, drafts outreach,       │
│  filters your customer database.     │
│                                      │
│  ○ Local — your data stays private   │
└──────────────────────────────────────┘
```

### Instruction to the implementer
Pull card descriptions from `departments.persona_prompt` first sentence, or a dedicated `departments.onboarding_description` column if that column exists. If neither is available: use the department name and default to a generic description based on the department slug.

### What happens on "Start with these"
```typescript
// For each selected department:
// 1. If activation_stage is not 'active': attempt to activate
//    (use existing activateDepartment() from department-lifecycle.ts)
// 2. Write to session: selected_department_slugs[]
// 3. Navigate to activation moment
```

### Design notes
- Orc is never shown in this gallery — he is not a department
- The "+ Add later" label appears on unselected cards — signals they can always add more
- Maximum 6 departments shown in this gallery for MVP. If more exist: show the 6 with highest usage or alphabetical

---

## The Activation Moment

### Route
`/onboarding/activate`

### Purpose
This is the most important screen in the entire product. The founder types their first real goal, Orc processes it using the existing dialogue/planning flow, and the dashboard opens with work already in progress. Not a demo. Not fake data. Real Orc output on a real goal.

### Phase 1 — Department initialisation (5–10 seconds)

While departments activate in the background, show a live progress view:

```
Your team is reading their briefs...

  Sales ──────────────────── Setting up context      ████████░░
  Marketing ──────────────── Loading business brief  ██████░░░░
  Orc ────────────────────── Ready                   ██████████
```

This is mostly cosmetic — it runs for 5 seconds while the Onyx personas are confirmed active. If a persona fails to respond to a health check: mark it with a warning indicator and continue. Do not block.

### Phase 2 — First goal input

Once the progress bars complete:

```
Your team is ready.

What's the first thing you want to get done?

┌────────────────────────────────────────────────────────┐
│ Get 50 retailers onboarded this month                  │
└────────────────────────────────────────────────────────┘

[ Skip for now — go to dashboard ]
```

Placeholder text should rotate through 3 examples relevant to the founder's interpreted business category. If category is 'credit/fintech': "Get 50 retailers onboarded this month." If category is 'saas': "Get our first 10 paying customers." If category is unknown: "What's your first goal this month?"

The skip option must be visible and easy. Never trap the founder.

### Phase 3 — Orc processes the goal

On submission, this is a real call to the existing Orc v2 planning endpoint. Use the existing `runOrchestratorTask()` flow.

**Important:** Because no tools are connected yet, Orc must be primed to produce a plan that consists entirely of drafts, research, and planning tasks — nothing that requires an external tool call. Inject this into the onboarding-specific Orc prompt context:

```
ONBOARDING CONTEXT:
This is the founder's first goal. No external tools are connected yet.
Produce a plan that consists entirely of:
- Draft tasks (writing, planning, research)
- Analysis tasks (summarising, prioritising)
Do not assign any tasks that require Gmail, Supabase queries, or external APIs.
The founder will connect tools as they need them.
```

Show a status message while Orc works:

```
Orc is breaking this down...

  ○ Querying your team's capabilities
  ○ Drafting the plan
  ○ Preparing your first approvals
```

Animate each line completing in sequence (~2 seconds each).

### Phase 4 — Transition to dashboard

When Orc returns a valid plan:

```typescript
// 1. Write the goal to the goals table
await supabase.from('goals').insert({
  founder_input: goalText,
  orchestrator_plan: orcPlan,
  status: 'awaiting_approval',
  // orc_session_id from the Orc v2 response
})

// 2. Write each task to approval_queue with status 'pending'
for (const task of orcPlan.tasks) {
  await supabase.from('approval_queue').insert({
    action_type: 'orchestrator_plan_task',
    action_label: task.label,
    reasoning: task.reasoning,
    payload: task,
    risk_level: task.risk_level,
    status: 'pending'
  })
}

// 3. Mark onboarding complete in system_config
await supabase.from('system_config').upsert({
  key: 'onboarding_complete', value: true
})

// 4. Navigate to /dashboard
router.push('/dashboard')
```

If Orc returns an error or times out: write the goal as a pending goal with an empty plan, show a brief message ("Your team is still thinking — check back in a moment"), and navigate to the dashboard. Never block on this.

If the founder skipped goal input: navigate to dashboard with no active goal.

### What the founder sees when the dashboard loads

The dashboard must detect an active goal on first load and surface it prominently:

```
┌─────────────────────────────────────────────────────────────┐
│ Orc has a plan for: "Get 50 retailers onboarded this month" │
│                                                             │
│  3 tasks waiting for your review    [ Review plan → ]       │
└─────────────────────────────────────────────────────────────┘
```

The approval feed should already be populated with the 3 tasks. The department cards should show the relevant departments in `awaiting_approval` or `running` status with pulse animations. The activity feed should show: "Goal received", "Plan drafted", "Awaiting founder approval".

The dashboard is alive on arrival. Not empty. Not demo data.

---

## Route Guard — Preventing Access Before Onboarding

```typescript
// middleware.ts
// Check system_config for onboarding_complete before allowing /dashboard access

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/dashboard')) {
    const onboardingComplete = await checkOnboardingComplete(request)
    if (!onboardingComplete) {
      return NextResponse.redirect(new URL('/onboarding/identity', request.url))
    }
  }

  // Redirect completed onboarding away from onboarding routes
  if (pathname.startsWith('/onboarding')) {
    const onboardingComplete = await checkOnboardingComplete(request)
    if (onboardingComplete) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }
}
```

---

## State Management

Use Zustand for onboarding state. This persists across screens within the session without requiring a database write on every field change. Only write to Supabase at the end of each screen completion.

```typescript
// store/onboardingStore.ts
interface OnboardingState {
  // Screen 1
  founderName: string
  city: string
  country: string
  businessDescription: string
  businessCategory: string
  stage: 'starting' | 'mvp' | 'traction' | 'scaling' | null

  // Screen 2
  riskTolerance: 'careful' | 'balanced' | 'aggressive'

  // Screen 3
  selectedDepartments: string[]   // slugs

  // Activation
  firstGoal: string
  orcPlan: OrchestratorPlan | null

  // Actions
  setIdentity: (data: Partial<OnboardingState>) => void
  setRiskTolerance: (value: string) => void
  toggleDepartment: (slug: string) => void
  setFirstGoal: (goal: string) => void
  setOrcPlan: (plan: OrchestratorPlan) => void
  reset: () => void
}
```

---

## API Routes Required

```typescript
// POST /api/onboarding/interpret-business
// Calls Orc with a lightweight prompt to interpret business description
// Returns: { category: string }
// Timeout: 3 seconds. On timeout: return { category: description }

// POST /api/onboarding/complete
// Writes all system_config values from onboarding state
// Activates selected departments
// Returns: { success: boolean, warnings: string[] }

// POST /api/onboarding/first-goal
// Calls runOrchestratorTask() with onboarding context injected
// Creates goal row and approval_queue rows
// Returns: { goal_id: string, plan: OrchestratorPlan }
// Timeout: 15 seconds. On timeout: create empty goal, return partial success.
```

---

## Error Handling — Every Failure Must Be Graceful

```
Business interpretation fails     → Show raw founder input as category. Continue.
Orc times out on first goal       → Create empty goal. Show "Your team is thinking". Continue.
Department activation fails       → Show warning indicator. Allow continuing with working depts.
Supabase write fails              → Retry once. If still fails: store in localStorage, retry on dashboard load.
User closes browser mid-onboarding → Resume from last completed screen on next visit.
                                     Check system_config for highest completed step.
```

---

## Resume Logic

If a founder starts onboarding and closes the browser:

```typescript
// On /onboarding load:
const lastStep = await getLastCompletedOnboardingStep()
// Checks system_config for onboarding_step value

const stepRoutes = {
  'none':              '/onboarding/identity',
  'identity_complete': '/onboarding/control',
  'control_complete':  '/onboarding/team',
  'team_complete':     '/onboarding/activate',
  'complete':          '/dashboard'
}

router.replace(stepRoutes[lastStep])
```

---

## What Gets Cut From Onboarding

The following are explicitly excluded from onboarding. If asked to add them: refer back to this decision.

| Element | Where it lives instead | Why cut |
|---------|----------------------|---------|
| API key input | Settings → API Keys | Blocks momentum before value is shown |
| Constitution signing / reading | Settings → Constitution | Full read causes drop-off |
| Custom commandment | Settings → Business Rules | Nice, not critical path |
| Tool connection (Gmail etc.) | Contextual — first time agent needs it | "Sales wants to connect Gmail — allow?" |
| Hardware / Ollama check | Deferred — cloud-only for now | Will add back when local mode is tested |
| Managed Cloud option | Not in MVP | Adds billing complexity, BYOK until volume |
| Department detail configuration | Department settings page | Founders can configure later |

---

## Timing Budget

```
Screen 1: Identity             90 seconds   (3 questions, conversational)
Screen 2: Control style        15 seconds   (one click)
Screen 3: Pick team            30 seconds   (card selection)
Activation: Dept init           8 seconds   (progress animation)
Activation: Goal input         20 seconds   (typing + submit)
Activation: Orc processing     10 seconds   (live status animation)
Activation: Dashboard load      5 seconds
──────────────────────────────────────────
Total                          ~3 minutes
```

---

## File Structure

```
app/
  onboarding/
    layout.tsx              ← Onboarding shell (no sidebar, no nav, dark warm background)
    page.tsx                ← Redirects to /onboarding/identity
    identity/
      page.tsx              ← Screen 1
    control/
      page.tsx              ← Screen 2
    team/
      page.tsx              ← Screen 3
    activate/
      page.tsx              ← Activation moment

components/
  onboarding/
    ReflectionBlock.tsx     ← Teal-bordered Orc response block
    ControlStyleCard.tsx    ← Risk tolerance option card
    DepartmentCard.tsx      ← Team selection card
    ProgressLine.tsx        ← "Sales ─── Loading ████░░" component
    ProfileSummary.tsx      ← Right panel live summary during Screen 1

store/
  onboardingStore.ts        ← Zustand state for full flow

app/
  api/
    onboarding/
      interpret-business/
        route.ts
      complete/
        route.ts
      first-goal/
        route.ts
```

---

## Design Tokens — Onboarding Only

These differ from the main dashboard to signal "setup mode":

```css
/* Background — warmer dark than dashboard */
--onboarding-bg: #0c0c0f;

/* Headline font — Fraunces serif (import from Google Fonts) */
--onboarding-heading-font: 'Fraunces', Georgia, serif;

/* Body font — DM Sans (same as dashboard) */
--onboarding-body-font: 'DM Sans', sans-serif;

/* Monospace for Orc reflection blocks */
--onboarding-mono-font: 'DM Mono', monospace;

/* Reflection block */
--reflection-border: #1D9E75;
--reflection-bg: rgba(29, 158, 117, 0.06);

/* Accent — teal */
--onboarding-accent: #1D9E75;

/* Generous negative space — padding 48px top/bottom on all screens */
```

---

## Smoke Test Sequence

Run this manually after implementation:

```
1.  Navigate to /dashboard without completing onboarding
    → Should redirect to /onboarding/identity

2.  Screen 1: Enter name "Joy", city "Lagos, Nigeria"
    → Reflection should appear: "Hey Joy. Building in Lagos — got it."

3.  Screen 1: Enter business "We give retailers access to inventory on credit"
    → Orc interprets: should return something like "B2B credit for informal retail"
    → Reflection should display the interpretation

4.  Screen 1: Select "Getting traction"
    → Should advance to Screen 2

5.  Screen 2: Click "Balanced"
    → Should advance immediately to Screen 3 (no Next button)

6.  Screen 3: Select Sales and Marketing (2 departments)
    → "Start with these" button should activate
    → Clicking should navigate to /onboarding/activate

7.  Activation: Progress bars should animate and complete within 10 seconds

8.  Activation: Type "Get 50 retailers onboarded this month"
    → Orc status animation should play
    → After ~10 seconds: should navigate to /dashboard

9.  Dashboard on first load:
    → Banner showing active goal should be visible
    → Approval feed should have at least 1 pending task
    → Activity feed should show "Goal received", "Plan drafted"
    → Department cards for Sales and Marketing should show pulse animation

10. Close browser mid-Screen 1, reopen
    → Should resume at Screen 1 (not restart from beginning)

11. Complete full onboarding, then navigate to /onboarding/identity
    → Should redirect to /dashboard
```

All 11 steps must pass. If any fail: do not ship.
