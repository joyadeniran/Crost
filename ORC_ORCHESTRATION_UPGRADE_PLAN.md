# ORC ORCHESTRATION UPGRADE PLAN
## Transforming Orc into the Founder's Chief of Staff

**Status:** Phase 4 Week 7 Complete — Week 8 next  
**Created:** May 16, 2026  
**Scope:** Comprehensive orchestration layer redesign for maximum founder trust and autonomy  
**Owner:** Engineering (Orc is the boss, not a feature — treat accordingly)

---

## Executive Summary

Orc is currently a **goal dispatcher** that routes work to departments. The upgrade path transforms it into a **Chief of Staff orchestration engine** that:

1. **Knows the entire company** (all resources, departments, past decisions, company memory)
2. **Makes intelligent decisions** (when to ask vs. plan vs. execute vs. escalate)
3. **Acts autonomously** where it has authority; escalates appropriately where humans decide
4. **Remembers context** across the founder's entire working lifetime, not just the current session
5. **Coordinates complexity** that no single department can handle
6. **Predicts needs** before the founder asks, surfacing suggestions and preventive actions

This plan covers:
- **Architecture upgrades** (knowledge integration, decision tree, context injection)
- **Response mode system** (direct answer / context-aware plan / full mission plan / clarification)
- **Advanced orchestration** (multi-department workflows, skill synthesis, external resource discovery)
- **Trust & control** (transparency into Orc's reasoning, founder veto points, audit trails)
- **Operational features** (recurring missions, scheduled actions, company calendar)

---

# SECTION A: CURRENT STATE AUDIT

## A.1 What Orc Currently Does

From `llm-client.ts` and `CROST_MASTER.md`:

**Current Capabilities:**
- Dispatches goals to appropriate departments
- Reads recent tasks from context (5-10 items)
- Creates artefacts from department outputs
- Routes tool calls through HITL approval
- Injects company memo summaries
- Falls back across LLM providers
- Distinguishes simple questions ("what can you do?") from complex goals
- Acts as direct assistant for low-risk actions (send email, save to KB)

**Current Limitations:**
- No cross-mission pattern recognition
- No forward-looking planning (scheduling, recurring work)
- No capability gap detection (doesn't warn when something is impossible)
- No resource optimization (doesn't know about tool limits, quota, concurrency)
- No founder preference learning (doesn't adapt to founder's style)
- No predictive actions (doesn't suggest work before it's needed)
- No external hiring/escalation (assumes all work can be done internally)
- Hallucinations protected against but not learned from
- No multi-department synthesis workflows
- Context is recent-only; no deep company history
- No governance model (can't enforce company-wide policies)

## A.2 What the Founder Needs from Their Chief of Staff

From the founder simulation (CROST_SPEC.md §2) and the "pitch deck warning" incident:

**Founder Expectations:**
1. **Context awareness** — Orc should know what I've been building, what my priorities are, what I told investors, what my runway is
2. **Risk assessment** — Orc should warn me when something doesn't align with what I've said publicly (like the pitch deck risk warning, but with clarification)
3. **Proactive advice** — "You haven't updated your metrics in 2 weeks, should I pull new ones?" 
4. **Autonomy respect** — Don't ask 5 clarifying questions when you can make reasonable assumptions
5. **Escalation clarity** — "This is beyond my authority; you decide." Not "I can't do this."
6. **Visibility** — Show your reasoning so I can override you if I disagree
7. **Learning** — Remember my preferences and apply them to future decisions

---

# SECTION B: ARCHITECTURE REDESIGN

## B.1 The "Three Brains" Model for Orc

Upgrade Orc's decision-making to operate three specialized processing paths:

### Brain 1: Rapid Context Retrieval (The Memory)
**Purpose:** Know the company state instantly.

**What it knows:**
- Company profile (industry, stage, funding, runway)
- Strategic goals (OKRs, quarters, vision) 
- Founder preferences (risk tolerance, work style, decision patterns)
- Department status (current capacity, recent work, skill inventory)
- Financial state (burn rate, cash runway, usage limits)
- External commitments (fundraising, customer commitments, partnerships)
- Past decisions and their outcomes (so Orc doesn't repeat mistakes)

**Implementation:**
```
CREATE TABLE orc_context (
  id UUID PRIMARY KEY,
  company_id UUID,
  context_type ENUM('profile', 'strategy', 'preference', 'constraint', 'outcome'),
  content JSONB,  -- structured data
  summary TEXT,   -- natural language excerpt for LLM injection
  recency_score INT,  -- 0-100, how fresh this is
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  source ENUM('founder_input', 'inferred_from_missions', 'extracted_from_memos')
);

-- Example rows:
-- { context_type: 'strategy', content: { goal: 'reach $10M ARR', timeline: 'Q4 2026' }, ... }
-- { context_type: 'constraint', content: { monthly_api_budget: 500, runway_months: 18 }, ... }
-- { context_type: 'preference', content: { approval_style: 'aggressive', 
--     tone_preference: 'conversational_not_verbose' }, ... }
```

**How Orc uses it:**
- Before every major decision, fetch top 20 context rows (ranked by recency + relevance)
- Inject as "COMPANY STATE SUMMARY" section in the prompt
- Use to evaluate risk, suggest next steps, and flag misalignments

### Brain 2: Decision Tree (The Judgment)
**Purpose:** Route founder intent to the right execution mode.

**Decision tree (pseudo-code):**
```
intent = parse(founder_message)

if is_question(intent):
  if is_simple_question(intent):
    → ASSISTANT_MODE: answer directly with context + suggestions
  else:
    → CLARIFICATION_MODE: ask focused follow-ups OR plan with assumptions documented
else if is_goal(intent):
  if has_critical_missing_info(intent):
    → CLARIFICATION_MODE: ask **conversationally**, not as forms
  else if is_routine_goal(intent, historical_patterns):
    → QUICK_PLAN_MODE: generate 3-5 tasks, dispatch immediately
  else if is_strategic_goal(intent):
    → FULL_PLAN_MODE: deep analysis, risk assessment, resource allocation
  else if is_assistant_action(intent):
    → DIRECT_ACTION_MODE: execute immediately (send email, save to KB, etc.)
else if is_command(intent):
  → COMMAND_MODE: execute the command, surface results

-- Within each mode, additional gates:
if mission_exceeds_capabilities(intent):
  → warn founder: "This requires [capability]. Here's what I CAN do instead."
if conflicts_with_company_policy(intent):
  → escalate: "This conflicts with [policy]. Want me to proceed anyway?"
if creates_compliance_risk(intent):
  → HUMAN_DECISION_MODE: surface risk, let founder choose
```

**Implementation in llm-client.ts:**
```typescript
interface OrcDecision {
  mode: 'assistant' | 'clarify' | 'quick_plan' | 'full_plan' | 'direct_action' | 'command' | 'escalate';
  confidence: 0.5 - 1.0;  // how sure is Orc about this mode choice?
  reasoning: string;       // why this mode (surfaced to founder in debug mode)
  followup_options: string[];  // e.g., ["approve and dispatch", "modify plan", "get more context"]
  risk_notes: string[];    // warnings, misalignments, or missing info
}

async function orcDecisionGate(intent: string): Promise<OrcDecision> {
  // Fetch context
  const companyState = await fetchOrcContext(userId);
  
  // Analyze intent
  const intentType = classifyIntent(intent, companyState);
  
  // Route to decision logic
  const decision = await routeIntent(intentType, intent, companyState);
  
  // Validate against company policy + founder preferences
  const validated = await validateAgainstPolicy(decision, companyState);
  
  return validated;
}
```

### Brain 3: Capability Inventory (The Realism)
**Purpose:** Know what can actually be done, and propose alternatives when something can't.

**What it tracks:**
- All departments and their current skills
- All connected tools (Gmail, GitHub, Slack, etc.) and their API limits
- All Composio actions and their success rates
- Available external services (design, legal, accounting)
- Skill layer capabilities (docx, pptx, code generation, image generation, etc.)
- Execution limits (quota per hour, cost per API call, rate limits)

**Implementation:**
```
CREATE TABLE capability_inventory (
  id UUID PRIMARY KEY,
  capability_type ENUM('department_skill', 'tool', 'external_service', 'skill_layer'),
  capability_slug TEXT,
  display_name TEXT,
  description TEXT,
  cost_per_use JSONB,  -- { api_calls: 5, tokens: 2000, credit_cost: 0.15 }
  rate_limits JSONB,   -- { calls_per_hour: 100, concurrent: 5 }
  success_rate FLOAT,  -- last 30-day success rate
  last_successful_use TIMESTAMP,
  last_failure TIMESTAMP,
  failure_reason TEXT,
  status ENUM('available', 'degraded', 'unavailable', 'experimental'),
  requires_connection BOOLEAN,  -- does it need OAuth setup?
  requires_approval BOOLEAN,    -- does it need founder approval?
  alternatives TEXT[],          -- ["alternative_1_slug", "alternative_2_slug"]
  metadata JSONB
);

-- Example rows:
-- { capability_type: 'tool', capability_slug: 'gmail.send_email', success_rate: 0.98, rate_limits: { calls_per_hour: 50 } }
-- { capability_type: 'skill_layer', capability_slug: 'image_generation', status: 'available', cost_per_use: { api_calls: 1 } }
-- { capability_type: 'external_service', capability_slug: 'video_editing', status: 'unavailable', alternatives: ['design_brief', 'animation_script'] }
```

**How Orc uses it:**
- Before suggesting a capability, check its status
- If unavailable, surface the alternative immediately
- If degraded, warn founder ("Gmail is running slow today")
- Track cost in real-time, prevent overspend
- Learn from failures (why did GitHub PR creation fail? Connection? Rate limit? Data?)

---

## B.2 Multi-Tier Context Injection

Current: Orc gets 5-10 recent tasks.  
**Upgraded:** Orc gets layered context based on decision mode.

### Layer 1: Company State (always)
```
COMPANY STATE:
Name: Acme AI
Industry: B2B SaaS / AI
Stage: Seed (Raising Series A)
Runway: 16 months
Last funding: $500K (Jan 2026)
Public positioning: "AI automation for creative teams"
Current focus: Customer onboarding, feature parity with competitors

KEY CONSTRAINTS:
- API budget: $500/month (currently at $380, 14 days left)
- Founder time: 50 hours/week max
- Approval preference: Balanced (careful on >$100 decisions, aggressive on quick wins)
```

### Layer 2: Strategic Memory (for goal/plan decisions)
```
STRATEGIC MEMORY (last 10 outcomes):
1. [Apr 28] Pitch deck completed → 15 investor meetings scheduled → 3 follow-ups pending
2. [Apr 26] Customer messaging audit → identified 5 weak positioning points → marketing revisions in progress
3. [Apr 20] Go-to-market timeline → pushed launch 2 weeks due to feature gaps
...

PATTERNS:
- Customer-facing work often needs 2-3 rounds of feedback before shipping
- Technical work (code, dashboards) tends to be accurate first-time
- Founder tends to approve things faster on Mondays (rest-of-week decision fatigue?)
```

### Layer 3: Department Capabilities (for dispatch decisions)
```
DEPARTMENT CAPABILITIES:
Marketing: [content_creation, brand_guidelines, social_strategy, graphics_design, image_generation]
Engineering: [architecture, code_review, api_design, script_automation, data_analysis]
Sales: [pitch_crafting, objection_handling, sales_strategy, outreach_sequencing, crm_management]
Finance: [financial_modeling, pricing_analysis, metrics_dashboard, budget_planning, unit_economics]
Legal: [contract_templates, privacy_policies, terms_of_service, trademark_search, governance_docs]

CURRENT LOAD:
Marketing: 2/5 capacity (just finished pitch deck, can take new work)
Engineering: 4/5 capacity (in middle of dashboard rebuild)
Sales: 1/5 capacity (light period, high availability)
```

### Layer 4: Recent Decisions (for consistency)
```
RECENT FOUNDER DECISIONS:
1. [May 10] Chose "balanced" approval mode (not aggressive)
2. [May 8] Rejected external design hire suggestion; wants to keep output internal
3. [May 5] Approved $200 spend on premium Composio tier
4. [May 3] Preferred "5-minute summary" over full analysis in reports
```

---

## B.3 Skill Synthesis & External Awareness

Current: If a capability doesn't exist, Orc fails.  
**Upgraded:** Orc proposes alternatives and escalates intelligently.

### Skill Synthesis Layer
```typescript
// When a department can't deliver something, check if a skill can fake it
interface SkillSynthesis {
  requested_capability: string;        // "video editing"
  available_fallback_skill: string;    // "animation_script"
  quality_tier: 'high' | 'medium' | 'low';
  effort_required_from_founder: 'none' | 'minor_edits' | 'significant_work';
  explanation: string;
}

// Example:
{
  requested: "video editing",
  available_fallback: "video_script_with_timing_and_visual_cues",
  quality_tier: "medium",
  effort: "minor_edits",
  explanation: "I can write a detailed script with exact timing, shot descriptions, and music cues. You'd need to use your video editor or hand to a contractor, but the script does 80% of the thinking."
}
```

### External Service Registry
```
CREATE TABLE external_services (
  id UUID,
  service_name TEXT,                       -- "video editing", "legal review", "financial audit"
  when_to_use TEXT,                        -- when internal capability isn't sufficient
  recommended_vendors TEXT[],              -- ["Fiverr", "Upwork", "specialized firm"]
  estimated_cost_range TEXT,               -- "$200-500", "$2000-5000", "negotiate"
  turnaround_time TEXT,                    -- "24-48 hours", "2 weeks"
  founder_decision_required BOOLEAN,       -- does founder need to approve hiring?
  orc_can_brief BOOLEAN,                   -- can Orc draft a hiring brief?
  status ENUM('available', 'blocked_by_budget', 'blocked_by_founder_preference')
);
```

**When Orc encounters a missing capability:**
```
Scenario: Founder asks "Design a 30-second video for LinkedIn"
Capability check: video_editing → unavailable

Response:
1. Check skills: "animation_script" available → offer fallback
2. Check external services: video editors available
3. Escalate with options:

"I can help in two ways:
1. [INTERNAL] I can write a detailed animation script with exact timing and visual cues. 
   You'd need to bring it into Premiere or another editor. Takes you 30 mins to polish.
   
2. [EXTERNAL] I can draft a hiring brief and suggest vendors on Upwork/Fiverr 
   ($200-400, 48-hour turnaround).

Which works for you?"
```

---

## B.4 Knowledge Integration: The Company Library

Current: Knowledge base exists but isn't deeply integrated into Orc's reasoning.  
**Upgraded:** Every decision reads relevant KB files automatically.

### Smart KB Injection
```typescript
// Before Orc makes a decision, automatically fetch relevant documents
async function enrichWithKnowledgeBase(intent: string, companyState: OrcContext) {
  // Semantic search in KB for relevance
  const relevantDocs = await semanticSearch(intent, userId, {
    max_results: 5,
    min_relevance: 0.7,
    recency_boost: true  // prefer recent files
  });
  
  // Rank by type:
  // 1. Policies (founder must know these are being applied)
  // 2. Previous decisions (pattern matching)
  // 3. Customer/market research (ground truth)
  // 4. Templates (execution efficiency)
  
  const injectionSummary = summarizeDocuments(relevantDocs);
  return injectionSummary;
}

// Example injection:
const prompt = `
You are Orc, the founder's AI Chief of Staff.

DECISION: Should I help draft a customer onboarding email?

KNOWLEDGE BASE CONTEXT:
1. [POLICY] Brand Voice Guidelines (May 5): "Our tone is friendly but not cutesy. Technical precision, human warmth."
2. [TEMPLATE] Customer Onboarding Sequence (Apr 20): 5-email sequence, successful with 40% open rate
3. [PREVIOUS OUTCOME] Q1 Onboarding Campaign: Tried 3 variants, #2 performed best with "quick win" positioning

REASONING:
Use the voice from brand guidelines, adapt the proven sequence template, and apply the Q1 learnings about "quick wins."
`;
```

---

# SECTION C: FOUNDER EXPERIENCE UPGRADES

## C.1 Response Modes: Smart Routing

The pitch deck warning showed the current problem: Orc warned about risk but didn't ask a clarification question. Here's the solution:

### Mode 1: ASSISTANT_MODE (Direct Answer)
**When:** Simple questions that don't need a full mission.
**Triggers:** "What can you do?", "How do I connect Gmail?", "What's my API usage?"
**Behavior:**
- Answer directly from context + KB
- Surface 2-3 relevant suggested actions
- No multi-task planning
- Complete in <10 seconds

**Example:**
```
Founder: "What's my current API usage?"

Orc (Assistant Mode):
"Your API usage for the month:
- Composio calls: 234 / 1000 (23%)
- LLM tokens: 1.2M / 5M (24%)

You're well within limits. Your monthly spend is $120 of a $500 budget.

Next steps: [Get detailed breakdown] [Optimize spending] [Upgrade plan]"
```

### Mode 2: CLARIFICATION_MODE (Focused Questions)
**When:** Goal is clear but critical context is missing. NOT forms; conversational prose.
**Triggers:** "Design a pitch deck" (audience? stage? brand guidelines? investor stage?)
**Behavior:**
- Ask 1-2 focused follow-up questions (not 5)
- Make reasonable assumptions and document them
- Show what happens with each assumption
- Offer "Skip & Plan Anyway" if founder is in a hurry

**Example (CURRENT - BAD):**
```
Founder: "Design our pitch deck"

Orc (Current):
⚠ Risk Warning: Deck may not reflect current financial situation.

What did you mean? Multiple choice?
1. Investor pitch
2. Customer pitch
3. Team alignment
4. Board meeting
[etc...]
```

**Example (UPGRADED - GOOD):**
```
Founder: "Design our pitch deck"

Orc (Clarification Mode):
I'm ready to help. A few quick things so I get this right:

1. Who's the audience? (I'm guessing Series A investors based on your last memo, 
   but could be customers, employees, or board.)
   
2. What's the core story? (Your last positioning focused on "AI for creative teams" — 
   should we stick with that or shift?)

I notice you're in fund-raising mode (last memo: "Raising Series A"). 
I'll weight toward investor-readiness unless you say otherwise.

Ready when you are. Or hit [Skip & Plan Anyway] if you want me to decide.
```

Key improvements:
- **Fewer questions** (2 not 5)
- **Show assumptions** (guessing Series A investors)
- **Offer escape hatch** (Skip & Plan Anyway)
- **Conversational** (not multiple choice)

### Mode 3: QUICK_PLAN_MODE (Fast Execution)
**When:** Routine goal that matches historical patterns.
**Triggers:** "Update sales metrics", "Create social content", "Summarize customer feedback"
**Behavior:**
- 3-5 tasks, dispatch immediately
- Show plan, wait 3 seconds for founder veto
- If no response → execute
- Report back on completion

**Example:**
```
Founder: "Create social posts for this week"

Orc (Quick Plan Mode - auto-executing in 3 seconds unless you stop it):
Plan:
1. [Marketing] Draft 5 LinkedIn posts from this week's updates
2. [Marketing] Draft 3 Twitter posts (witty/technical angle)
3. [Engineering] Pull this week's metrics for quotes/social proof
4. [Execution] Review and schedule to LinkedIn native + TweetDeck

Dispatching in 3... 2... 1...
[SKIP] [MODIFY PLAN]

---
[2 minutes later]
Posts ready! Check #artifacts. 

Next: [Schedule to social] [Get feedback from team] [Refine messaging]
```

### Mode 4: FULL_PLAN_MODE (Strategic Analysis)
**When:** Complex, multi-department goal with strategic implications.
**Triggers:** "Pivot our positioning", "Redesign onboarding", "Restructure the team"
**Behavior:**
- Deep analysis (what will this cost? what could go wrong? what's the alternative?)
- Break into 10-20 tasks across departments
- Surface dependencies, risks, and resource needs
- Await founder approval before dispatching

**Example:**
```
Founder: "We need to redesign customer onboarding"

Orc (Full Plan Mode):
This is a big one. I've mapped out what's involved:

STRATEGIC ANALYSIS:
- Current state: 5-email sequence, 40% open rate, 3-day to first value
- Proposed: Hands-on setup call → in-app walkthrough → async onboarding
- Impact: Higher initial effort (Ops + Engineering) but likely +20% activation rate
- Timeline: 4 weeks (2 weeks design, 2 weeks development + testing)
- Cost: ~120 founder hours + $800 Composio/tooling

PHASES:
Phase 1 (Week 1): Research & Design
  - [Marketing] Analyze competitor onboarding (best practices research)
  - [Sales] Interview 5 recent customers (what felt hard?)
  - [Product] Map current UX and pain points
  
Phase 2 (Weeks 2-3): Build & Test
  - [Engineering] Build in-app walkthrough scaffold
  - [Operations] Draft new sequence + automation
  - [Design] Create UI mocks for walkthrough flows
  
Phase 3 (Week 4): Launch & Monitor
  - [Operations] Deploy to beta cohort (10 customers)
  - [Sales] Monitor, collect feedback
  - [Finance] Track activation rate change

DEPENDENCIES:
- Phase 2 can't start until Phase 1 research is done
- Engineering and Design can work in parallel
- Phase 3 depends on all Phase 2 work being complete

RISKS:
🟡 If activation rate doesn't improve, sunk cost of 120 hours
🟡 High founder involvement required (decisions on UX, messaging)

RESOURCE IMPACT:
- Engineering: 40 hours (medium capacity hit)
- Operations: 20 hours
- Marketing: 10 hours
- Sales: 8 hours (interviews)

Next steps:
[Approve full plan] [Modify scope] [Start Phase 1 only] [Get more detail on specific phase]
```

### Mode 5: DIRECT_ACTION_MODE (Immediate Execution)
**When:** Low-risk assistant actions (send email, save to KB, rename artefact).
**Triggers:** "/gmail.send_email", "Save this to the knowledge base", "Remind me in a week"
**Behavior:**
- Execute immediately (with HITL approval for external actions)
- Report back quickly
- Surface next steps if relevant

**Example:**
```
Founder: "Send the pitch deck to alice@example.com"

Orc (Direct Action Mode - needs approval):
[APPROVAL NEEDED]
Action: Send Pitch_Deck.pptx to alice@example.com
Risk: Medium (external communication, but founder controls recipients)

[APPROVE] [MODIFY] [CANCEL]

---
[After approval]
Done! Sent at 2:43 PM. 
Status: 📧 Delivered

Next: [Schedule follow-up] [Copy all investors] [View in Gmail]
```

---

## C.2 The Risk Assessment & Clarification Loop

Problem: The pitch deck warning had no clarification. Founder just said "yes, design it anyway."

**Solution: The Three-Tier Warning System**

### Tier 1: Assumption Warning (Low friction)
**Triggers:** When Orc makes a reasonable assumption but founder might not agree.
**Behavior:** State the assumption clearly; let founder ignore it.

```
Founder: "Design a pitch deck"

Orc:
I'm assuming:
✓ Series A investors (from your last memo)
✓ Technical + market + team slides (standard A-deck structure)
✓ Your recent brand guidelines (refreshed April)

Sound right? [YES] [NO, THIS IS DIFFERENT]
```

### Tier 2: Conflict Warning (Medium friction)
**Triggers:** When the goal conflicts with stated company policy or previous decisions.
**Behavior:** Point out the conflict; ask founder to choose.

```
Founder: "Cut customer support response time to 4 hours"

Orc:
⚠️ This conflicts with your stated priority: "Maximize founder time" (from Apr 28 memo).
Hitting a 4-hour SLA will require hiring support staff ($8K/month) or 
automating 80% of responses (4 weeks of Engineering time).

Which is more important right now?
[Keep founder time sacred] [Invest in support] [Try automation first]
```

### Tier 3: Capability Gap (High friction)
**Triggers:** When the goal exceeds Orc's/departments' capabilities.
**Behavior:** Be explicit about the gap; propose alternatives.

```
Founder: "Create a 30-second product demo video"

Orc:
I don't have video editing in my current toolkit. Here's what I CAN do:

OPTION A [INTERNAL - 2 hours]:
Create a detailed animation script with exact timing, shot descriptions, music cues, 
and text overlays. You'd use Premiere (or hand to contractor) to produce it.

OPTION B [EXTERNAL - 2 days, $200-400]:
I'll draft a creative brief and post on Upwork/Fiverr. Someone produces the video.

OPTION C [ALTERNATIVE - 1 hour]:
Create a compelling slide deck with voiceover script (you record on your phone).

Which works?
[Internal script] [Hire external] [Do slide deck instead] [Skip for now]
```

---

## C.3 Transparency & Founder Veto

Orc should show its reasoning so founders can override.

### The Reasoning Panel (opt-in debug mode)

Founders can click "[Show Orc's reasoning]" to see:
```
WHY ORC CHOSE FULL_PLAN_MODE FOR THIS GOAL:

Confidence in classification: 87%

Decision tree:
✓ Is this a question? No
✓ Is this a goal? Yes
✓ Has critical missing info? No (sufficient context from company memo)
✓ Matches historical routine pattern? No
  - Similar goals in past 30 days: 0
  - Estimated complexity: 8/10 (multi-department, new process)
→ Route to: FULL_PLAN_MODE

Assumptions applied:
✓ Audience: Series A investors (from Apr 28 funding round memo)
✓ Current brand: Refreshed April 2026 (per brand guideline update)
✓ Timeline: Standard (4-week design + build)

Risk flags considered:
🟡 Depends on Engineering capacity (currently at 80%, would spike to 100%)
🟡 High founder involvement (decision-making overhead)
✓ No budget impact (within current Composio/tooling spend)

Company policies applied:
✓ Approval style: Balanced (medium-risk items need approval)
✓ Founder preference: Internal work preferred over external hire

Suggested next step:
Given Engineering load, consider Phase 1 (research + design) only this week,
Phase 2 (build) next week. Spreads load.
```

---

# SECTION D: OPERATIONAL FEATURES

## D.1 Recurring Missions & Scheduled Work

Current: Goals are one-off.  
**Upgraded:** Orc can run recurring work and schedule it intelligently.

### Recurring Mission Model
```
CREATE TABLE recurring_missions (
  id UUID PRIMARY KEY,
  name TEXT,                       -- "Weekly sales metrics update"
  frequency ENUM('daily', 'weekly', 'biweekly', 'monthly', 'quarterly'),
  schedule JSONB,                  -- { day_of_week: 'Monday', time: '09:00 UTC', timezone: 'America/Los_Angeles' }
  template_goal TEXT,              -- the actual goal prompt
  data_refresh_source TEXT,        -- where to pull fresh data ("salesforce", "zendesk", "internal_db")
  department_slug TEXT,            -- which department runs it
  auto_dispatch BOOLEAN,           -- auto-run or need founder approval?
  approval_threshold ENUM('low', 'medium', 'high'),  -- who needs to approve?
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  runs ARRAY(
    { run_date: DATE, goal_id: UUID, status: 'completed'|'failed', artefact_id: UUID }
  ),
  status ENUM('active', 'paused', 'disabled'),
  created_at TIMESTAMP
);

-- Examples:
-- { name: 'Weekly metrics summary', frequency: 'weekly', schedule: { day: 'Monday', time: '08:00' }, auto_dispatch: true }
-- { name: 'Monthly financial forecast', frequency: 'monthly', auto_dispatch: false }
-- { name: 'Daily standup report', frequency: 'daily', auto_dispatch: true, approval_threshold: 'low' }
```

**Founder experience:**

```
Founder: "Run a weekly sales metrics summary every Monday morning"

Orc:
Perfect. I'll set this up:
- Every Monday at 9:00 AM Pacific
- Pull latest data from Salesforce
- Sales department drafts summary
- Auto-dispatch (you can turn on manual approval if you want)

Suggested next: Let me run it once manually so you can see what it looks like.
[RUN NOW] [SCHEDULE ONLY] [ADJUST TIME/FREQUENCY]

---
[Monday 9:00 AM, auto-dispatched]
📊 Weekly Sales Metrics (Week of May 19)

Pipeline: $2.3M (↑ $200K from last week)
New meetings: 12 (↓ 2 from last week)
Close rate: 23% (stable)

[View full analysis] [Archive] [Forward to team] [Pause recurring]
```

---

## D.2 Company Calendar & Event Awareness

Orc should know about upcoming founder events and proactively prepare.

### Calendar Integration
```
CREATE TABLE company_calendar_events (
  id UUID PRIMARY KEY,
  type ENUM('investor_meeting', 'customer_call', 'board_meeting', 'conference', 'deadline'),
  title TEXT,
  date TIMESTAMP,
  duration_minutes INT,
  attendees TEXT[],              -- emails of attendees
  prep_required TEXT,            -- "pitch deck", "metrics summary", "customer list"
  related_goals UUID[],          -- goals that informed this meeting
  meeting_notes TEXT,            -- notes from the meeting
  outcomes TEXT,
  next_actions TEXT[],
  created_at TIMESTAMP
);
```

**Proactive Orc behavior:**

```
[Monday 9:00 AM]
Orc surfaces in dashboard:
🔴 UPCOMING: Series A investor call with Accel (Wednesday 2 PM)

Prep needed:
- Pitch deck (ready, but 2 weeks old — want a refresh?)
- Q1 metrics (ready)
- Customer list for social proof (need to pull)

Suggested prep:
[Update pitch deck] [Pull customer metrics] [Draft talking points] [Schedule prep meeting]
```

---

## D.3 Learning from Outcomes: The Decision Log

Orc should remember what worked and what didn't.

### Decision Outcome Tracking
```
CREATE TABLE orc_decision_log (
  id UUID PRIMARY KEY,
  decision_type TEXT,                    -- "choice between two plans", "response mode selection", "dept assignment"
  founder_intent TEXT,
  orc_choice TEXT,
  confidence FLOAT (0.0-1.0),
  assumptions JSONB,
  founder_override BOOLEAN,              -- did founder override Orc's choice?
  override_reason TEXT,
  outcome ENUM('successful', 'partial', 'failed', 'unknown'),
  outcome_description TEXT,
  weeks_to_outcome INT,
  created_at TIMESTAMP,
  outcome_at TIMESTAMP
);
```

**Self-improvement loop:**

```
Every week, Orc queries recent decisions and learns:

FROM decision_log WHERE decision_type = 'response_mode_selection' AND outcome_at > now() - 7 days:
- 87% of goals classified as QUICK_PLAN_MODE succeeded (good pattern)
- 60% of CLARIFICATION_MODE goals: founder overrode and wanted FULL_PLAN_MODE instead
  → Adjust: More founders are impatient than I think; maybe bias toward FULL_PLAN_MODE
  
- 3 times I chose an external service for video editing → 100% successful outcomes
  → Remember: video editing external = good outcome

Next refinement:
Increase confidence in FULL_PLAN_MODE for complex multi-dept work.
Keep recommending external video editing (high success rate).
```

---

# SECTION E: RESOURCE OPTIMIZATION

## E.1 Department Load Balancing

Orc should be smart about who gets what work.

### Capacity-Aware Dispatch
```typescript
// Before assigning a task, check department capacity
async function selectBestDepartment(taskType: string, estimatedHours: number): Promise<Department> {
  const candidates = await getDepartmentsCapableOf(taskType);
  
  const scored = candidates.map(dept => ({
    dept,
    available_capacity: dept.max_capacity - dept.current_load,
    success_rate_on_tasktype: dept.task_type_success_rate,
    recency_score: dept.last_task_days_ago,  // recently active = better context
    backlog_length: dept.pending_tasks.length,
    estimated_delivery_days: estimatedHours / (dept.available_capacity || 1),
  }));
  
  // Prefer: high capacity, high success rate, recent activity
  const best = scored.sort((a, b) => score(a) - score(b))[0];
  
  return best.dept;
}

// Example:
Task: "Draft customer onboarding email"
Candidates:
1. Marketing: capacity 1/5, success_rate 96%, last_task 2h ago → SCORE: 98
2. Sales: capacity 4/5, success_rate 92%, last_task 5d ago → SCORE: 88
3. Customer Support: capacity 2/5, success_rate 78%, last_task 30m ago → SCORE: 76

→ Dispatch to Marketing (best fit)
```

## E.2 Cost Tracking & Alerts

Orc should prevent overspend and warn about budget limits.

### Budget-Aware Execution
```
Query: "Create a full marketing website from scratch"

Orc assessment:
Estimated cost:
- Composio calls: 200 (@ 0.015 each = $3)
- LLM tokens: 100K (@ 0.0006 each = $60)
- Image generation: 20 (@ 0.05 each = $1)
Total: $64

Your monthly budget: $500 (currently spent: $380)
Remaining: $120

⚠️ This mission uses 53% of your remaining monthly budget.
You have 16 days left in May.

Continue? [YES, PROCEED] [SCALE DOWN] [SKIP FOR NOW]
```

---

# SECTION F: IMPLEMENTATION ROADMAP

## F.1 Phase 1: Foundation (Weeks 1-2)

### Week 1: Context & Decision Tree
- [ ] Build `orc_context` table + migration
- [ ] Build `capability_inventory` table + initial population
- [ ] Implement Brain 1 (Memory): `fetchOrcContext()` function
- [ ] Implement Brain 2 (Decision Tree): `orcDecisionGate()` function
- [ ] Update `ORCHESTRATOR_SYSTEM_NOTE` to include decision-tree logic
- [ ] Update `llm-client.ts` to call `orcDecisionGate` on every goal

**Metrics:** Orc correctly classifies goal intent 90%+ of the time (measured via simulation)

### Week 2: Response Modes
- [ ] Implement ASSISTANT_MODE (direct answer, no planning)
- [ ] Implement QUICK_PLAN_MODE (auto-execute routines)
- [ ] Implement CLARIFICATION_MODE (1-2 conversational questions)
- [ ] Implement FULL_PLAN_MODE (strategic analysis)
- [ ] Update War Room UI to show which mode Orc chose
- [ ] Add "[Show Orc's reasoning]" debug panel

**Metrics:** Response times <5sec for ASSISTANT_MODE, >20sec for FULL_PLAN_MODE

---

## F.2 Phase 2: Intelligence (Weeks 3-4)

### Week 3: Knowledge Integration & Capability Gaps
- [ ] Integrate semantic KB search into `enrichWithKnowledgeBase()`
- [ ] Implement capability gap detection (does Orc know what it can/can't do?)
- [ ] Build `external_services` table + initial vendor data
- [ ] Implement skill synthesis fallback logic
- [ ] Update Orc prompt to propose alternatives when capabilities are missing

**Metrics:** Orc suggests a viable alternative for 80%+ of capability gaps

### Week 4: Risk Assessment
- [ ] Implement 3-tier warning system (assumption / conflict / gap)
- [ ] Build checks for company policy conflicts
- [ ] Build checks for founder preference violations
- [ ] Update decision tree to surface risks via `orc_notes`

**Metrics:** Founders override Orc <10% of the time (good confidence)

---

## F.3 Phase 3: Operations (Weeks 5-6)

### Week 5: Recurring Missions & Scheduling ✅
- [x] Build `recurring_missions` table (`20260517000010_recurring_missions.sql`)
- [x] Implement scheduler (cron job — `app/api/cron/recurring-missions/route.ts`)
- [x] Implement auto-dispatch logic for low-risk recurring work (`checkAutoDispatchEligibility`)
- [x] Build UI for "set up recurring goal" (`RecurringMissionModal` in WarRoom)

**Metrics:** 5+ recurring missions running in production

### Week 6: Learning & Optimization ✅
- [x] Build `orc_decision_log` table (migration `20260516000009` — Phase 2)
- [x] Implement decision outcome tracking (`writeOutcomeToDecisionLog` called on completed/failed)
- [x] Build weekly learning query (`computeLearningInsights` — mode/tier success rates)
- [x] Auto-adjust Orc confidence scores based on outcomes (`adjustRecencyScores` — [10,100] clamped)
- [x] Weekly cron sweep (`app/api/cron/orc-learning/route.ts`)

**Metrics:** Orc decision accuracy improves week-over-week by 2%+

---

## F.4 Phase 4: Integration (Weeks 7-8)

### Week 7: Calendar & Proactive Suggestions ✅
- [x] Build `company_calendar_events` table (`20260518000001_company_calendar_events.sql`)
- [x] Integrate with founder calendar (Google Calendar via Composio — `app/api/cron/calendar-sync/route.ts`)
- [x] Implement proactive prep notifications (`CalendarPrepPanel` in WarRoom — urgency badges + action chips)
- [x] Build "prep checklist" for upcoming events (`buildPrepChecklist` — rule-based per event type with one-click goalPrompts)

### Week 8: Cost Tracking & Stress Testing
- [ ] Implement real-time cost tracking
- [ ] Add budget alerts to decision gateway
- [ ] E2E testing with real founder workflows
- [ ] Production readiness audit

---

## F.5 Phase 5: Refinement & Polish (Weeks 9+)

- [ ] Feedback incorporation from beta founders
- [ ] Performance optimization (context injection latency)
- [ ] Edge case hardening
- [ ] Comprehensive logging for observability

---

# SECTION G: SUCCESS CRITERIA

## Founder-Facing Metrics

1. **Confidence**: Founder overrides Orc <5% of the time in QUICK_PLAN_MODE
2. **Speed**: Time from goal submission to first artefact <10 minutes average
3. **Accuracy**: Artefacts rated "good or better" 80%+ of the time (founder feedback)
4. **Autonomy**: Orc routes to DIRECT_ACTION_MODE 20%+ of the time (vs. planning everything)
5. **Learning**: Orc's response improves week-over-week (measured via decision log)

## Internal Metrics

1. **Decision Quality**: Correct classification of goal intent 90%+
2. **Context Freshness**: Average context age <7 days in system
3. **Capability Accuracy**: Capability inventory matches reality 95%+
4. **Cost Control**: Zero budget overages; < 5% margin to limit warnings
5. **Observability**: All Orc decisions logged with reasoning + outcome

---

# SECTION H: POST-MVP ROADMAP

These are out of scope for Phase 1 but are the natural evolution:

1. **Sub-agents within departments** (Marketing Head coordinating Content + SEO + Outreach agents)
2. **Founder behavior modeling** (learn founder's decision-making style, apply it to autonomous decisions)
3. **Real-time market awareness** (monitor news, competitor moves, customer signals; proactively suggest pivots)
4. **Financial modeling automation** (real-time unit economics, burn rate forecasting, runway alerts)
5. **Scheduled background work** (daily briefing, weekly deep dives, monthly strategic reviews)
6. **Multi-founder teams** (coordinate across co-founders, manage authority boundaries)
7. **Board-readiness system** (auto-generate board reports, track quarterly goals, prep for board calls)

---

# SECTION I: CRITICAL DECISIONS FOR LEADERSHIP

### Decision 1: Should Orc always show its reasoning?

**Options:**
- A) Always show (clutters UI, but maximum transparency)
- B) Show on request (opt-in debug mode, clean UI)
- C) Show only for risky decisions (medium trust)

**Recommendation:** B (opt-in debug mode)  
**Reasoning:** Founders don't need the reasoning for routine decisions, but should be able to see it on request. Balances clarity and UX.

### Decision 2: Should Orc auto-execute in QUICK_PLAN_MODE?

**Options:**
- A) Auto-execute after 3-second countdown (vs. founder veto)
- B) Always require approval, even for routine work
- C) Based on founder approval preference (aggressive mode = auto, careful mode = require)

**Recommendation:** C (founder controls via approval preference)  
**Reasoning:** Respects founder autonomy + risk tolerance. Aggressive founders want speed; careful founders want control.

### Decision 3: Should Orc warn about *every* assumption?

**Options:**
- A) Warn about all assumptions (transparent but noisy)
- B) Warn only about material assumptions (founder's audience, budget, timeline)
- C) Warn only if assumption conflicts with past decisions

**Recommendation:** B (warn about material assumptions only)  
**Reasoning:** Keeps warnings actionable, not notification fatigue.

---

# APPENDIX A: GLOSSARY

- **Orc Decision Gate**: The entry point where every founder input is classified and routed
- **Response Mode**: The type of response Orc gives (Assistant / Clarify / Quick Plan / Full Plan / Direct Action)
- **Company State**: All structured knowledge about the company (profile, constraints, preferences)
- **Capability Inventory**: Registry of what Orc/departments/tools can actually do
- **Skill Synthesis**: When Orc offers a fallback skill instead of the originally requested capability
- **HITL**: Human-In-The-Loop; founder approval required before external action
- **Context Injection**: Automatically providing relevant company context before Orc makes decisions
- **Decision Log**: Record of Orc's choices and their outcomes (for learning)
- **Recurring Mission**: A goal that runs on a schedule (daily, weekly, monthly, etc.)

---

# APPENDIX B: DATA MODEL SUMMARY

```sql
-- Core tables to create:
orc_context           -- company state, strategy, constraints
capability_inventory  -- what Orc can do
external_services     -- hiring, outsourcing options
recurring_missions    -- scheduled work
company_calendar_events  -- upcoming events, deadlines
orc_decision_log      -- decisions + outcomes (for learning)

-- Schema additions to existing tables:
goals.orc_decision_reasoning   -- why Orc routed this way (for debugging)
goals.assumed_context         -- what Orc assumed (transparency)
goals.capability_check_result  -- was this possible? (for learning)
```

---

# APPENDIX C: SAMPLE CONVERSATIONS (Future State)

### Conversation 1: Pitch Deck (with upgraded warning)
```
Founder: "Design a pitch deck for our Series A"

Orc (Clarification Mode):
I've got context from your April memo that you're fundraising Series A. 
A few quick things to get this right:

1. Who's the investor? (I'm assuming a general "Series A deck" structure, 
   but if you want to customize for a specific firm, that changes the narrative.)

2. What's your biggest update since the last pitch? 
   (Last deck was April 15 — you've gotten 15 customer meetings since. 
   Want to highlight that or keep focus on the original story?)

I can sense a conflict: your last memo said "maximize founder time" but a 
pitch deck this good will need 3-4 hours of feedback loops. 
Want to time-box it to 2 hours instead? (Faster turnaround, slightly less polish.)

Ready when you are. [PROCEED] [SKIP & PLAN ANYWAY]
```

### Conversation 2: Routine Work (auto-execution)
```
Founder: "Pull this week's metrics"

Orc (Quick Plan Mode):
Pulling your weekly summary (auto-dispatching in 3 seconds):

1. Finance pulls your bank balance, runway, burn rate
2. Sales pulls pipeline, new meetings, close rate
3. Engineering pulls GitHub commits, bugs closed, uptime

[SKIP] [MODIFY]

---
[2 minutes later]
Done! Your weekly metrics summary is ready.

Key highlights:
- Runway: 16 months (↑ 1 month from last week due to cost cuts)
- Pipeline: $2.3M ARR (↑ $200K from customer expansion deals)
- Engineering: 23 bugs closed, 0 critical issues, 99.8% uptime

Next: [Send to investors] [Share with team] [Dive into one metric] [Schedule weekly]
```

### Conversation 3: Capability Gap (with fallback)
```
Founder: "Create a product demo video for LinkedIn"

Orc (Full Plan Mode):
I don't have video editing built in. Here's what I CAN do:

PLAN A [INTERNAL - 1 hour, your effort: 30 mins]:
1. I write a detailed animation script with exact timing, shot descriptions, 
   voiceover cues, and music cues
2. You use Premiere (or Camtasia, or your phone) to produce it
3. Result: professional demo video, 80% of the thinking already done

PLAN B [EXTERNAL - 2 days, $250-400]:
1. I draft a creative brief with examples
2. I post on Upwork/Fiverr
3. Freelancer produces the video
4. You approve and publish

PLAN C [QUICK ALTERNATIVE - 30 mins]:
1. I create a 5-slide deck with bullet points, quotes, and screenshots
2. You record a voiceover on your phone (simple but effective)
3. Drop into LinkedIn as a carousel post

Which route? [Internal script] [Hire external] [Do deck instead] [Skip for now]
```

---

**END OF PLAN**

---

## Next Steps

1. **Review & Feedback** (this week): Leadership review, adjust based on feedback
2. **Technical Design** (next week): Finalize schema, data model, API contracts
3. **Phase 1 Kickoff** (week after): Start with context table + decision gate
4. **Weekly Sync**: Every Monday review progress against roadmap

This plan positions Orc as the true Chief of Staff the founder needs — not a feature, but the entire operating system's intelligence layer.

