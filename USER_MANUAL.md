# CROST User Manual

**Version:** 1.0  
**Last Updated:** May 15, 2026  
**Status:** Production-Ready (All 147 tests passing, zero lint errors, zero type errors)

---

## Table of Contents

1. [What is Crost?](#what-is-crost)
2. [Getting Started](#getting-started)
3. [Core Features](#core-features)
4. [Workflow Examples](#workflow-examples)
5. [End-to-End Testing Guide](#end-to-end-testing-guide)
6. [Troubleshooting](#troubleshooting)
7. [Recommendations & Known Limitations](#recommendations--known-limitations)

---

## What is Crost?

### Philosophy

**Crost is NOT a chatbot.** It's a **Human-in-the-Loop Company Operating System** where AI simulates specialist departments, coordinated by Orc (your AI Chief of Staff), to help you run your company.

The goal is to help founders **think better, operate faster, and execute more consistently** — not to automate tasks for their own sake.

### Key Principles

- **Crost feels like an office, not a chat window.** You interact through one intelligent layer (Orc), not juggling many disconnected assistants.
- **You get value quickly.** Your first artifact lands within 5 minutes of signup.
- **You stay in control.** External actions always require explicit human approval. No exceptions.
- **Everything is cited.** You can trace any output back to the memos, knowledge base files, and tool calls that created it.

---

## Getting Started

### Phase 1: Signup & Authentication

#### Step 1.1: Create Your Account

1. Go to `https://app.crosthq.com/signup`
2. Choose your preferred auth method:
   - **Google** or **Apple** (recommended — no OTP needed)
   - **Email/Password** (requires OTP verification)

**What you'll see:**
- If using OAuth (Google/Apple): Straight to onboarding identity
- If using Email/Password: Verification email sent; check spam folder if needed

#### Step 1.2: Verify Email (Email/Password only)

- Check your email for the OTP code
- Return to Crost and enter the code
- Once verified, you can proceed to onboarding

### Phase 2: Onboarding Journey

#### Step 2.1: Answer Three Questions (3 minutes)

The onboarding walks you through three questions, one at a time:

**Question 1: "Who are you?"**
- Enter your first name and your city/country (autocomplete available)
- This personalizes Orc's communication

**Question 2: "What does your company do?"**
- Free-text description (e.g., "We build AI tools for product teams")
- Orc interprets this and reflects it back (e.g., "AI-powered product development platform")
- This helps Orc understand your context

**Question 3: "What stage are you at?"**
- Select: Just Starting / Early MVP / Getting Traction / Scaling
- This helps Orc calibrate its suggestions and risk tolerance

#### Step 2.2: Meet Orc

A full-screen introduction appears:

> **"Meet Orc — your AI Chief of Staff."**  
> *Orc plans your work, coordinates departments, and helps you run your company. Departments are specialist teams Orc activates when needed.*

Orc is represented by a simple icon (not a face — Crost avoids over-anthropomorphism).

#### Step 2.3: Select Your Departments

You'll see cards for available departments. **Select at least 2 (max 3).**

Common departments:
- **Marketing:** Content, campaigns, positioning, brand strategy
- **Sales:** Outreach plans, pitch decks, sales processes
- **Engineering:** Technical documentation, code generation, architecture
- **Finance:** Budget analysis, financial models, forecasts
- **Operations:** Process design, workflow optimization, planning
- **Research:** Market research, competitive analysis, insights
- **People:** HR processes, team structure, hiring plans

You can add more departments later in Settings.

#### Step 2.4: Your First Mission

Orc suggests a mission based on your business category. Examples:
- "Create a pitch deck"
- "Build an outreach plan"
- "Draft a go-to-market strategy"
- "Generate customer personas"

You can:
- **Accept** the suggestion and launch immediately
- **Edit** the mission description
- **Type your own** mission
- **Skip for now** and explore the dashboard first

---

## Core Features

### 1. War Room (Command Center)

The War Room is where Orc coordinates your departments and executes missions.

#### What You'll See

**Live Event Feed (Left Sidebar)**
- Shows real-time activity: "Orc is planning…", "Task started", "Awaiting approval", etc.
- Breathing dots indicate active tasks
- Color-coded by event type

**Mission Plan (Center)**
- A list of tasks Orc has planned
- Each task shows:
  - **Reasoning:** Why this task is needed
  - **Expected Deliverable:** What the task will produce
  - **Department:** Which team will handle it
  - **Status:** Idle, Running, Complete, Failed, Needs Data

**Approval Queue (Right Sidebar)**
- Tasks requiring human approval appear here
- Click to review and approve/deny

#### How to Start a Mission

1. Click the **Goal Composer** at the top
2. Type your mission (e.g., "@marketing Create a content calendar for Q3")
3. Press Enter or click Send
4. Orc immediately begins planning (you'll see "Preparing your mission…")
5. Once the plan is ready, review the tasks and approve

#### Department Status

Each department shows its current state:
- **Idle:** Not currently working
- **Working:** Executing a task
- **Awaiting Input:** Needs more information from you
- **Needs Data:** Requires additional context (e.g., a missing API key)

If a department is blocked, click it to see the detailed reason.

### 2. Artifacts (Outputs)

Every completed task produces an artifact — the actual deliverable (document, spreadsheet, code, etc.).

#### Accessing Artifacts

Go to **Artifacts** in the sidebar to see all outputs.

**Each artifact shows:**
- **Visual preview** (formatted preview of the file)
- **File type** (DOCX, XLSX, JSON, MD, etc.)
- **Download button** (get the native file)
- **Metadata tab** showing:
  - Parent goal (which mission it came from)
  - Task ID (traceable back to the plan)
  - Sources (memos, KB files, tool calls used to create it)

#### Using Artifacts

- Download the native file to edit locally
- Share the preview link with stakeholders
- Add to Knowledge Base for future reference

### 3. Memos (Company Memory)

Memos are where Crost stores institutional knowledge about your company.

#### Types of Memos

**Foundational Memos** (created during onboarding)
- Company profile (name, stage, description)
- Your profile (role, location)

**Contextual Memos** (created during work)
- High-priority findings (market insights, competitive threats)
- System notes (Orc's observations, assumptions made)
- Failed task summaries (what went wrong and why)

**Mission Reports** (created after goal completion)
- Summary of work completed
- Key findings and recommendations
- Suggested next steps

#### Managing Memos

Go to **Memos** in the sidebar:
- **View** any memo by clicking it
- **Search** for memos by topic or date
- **Edit** foundational memos to update your company info
- **Delete** if no longer needed (but be careful — memos inform Orc's decisions)

**Pro Tip:** Memos are your "source of truth." Keep them accurate. Orc references them for every mission, so stale memos lead to stale outputs.

### 4. Knowledge Base (External Context)

Upload documents that should inform Orc's work — brand guidelines, product specs, market research, etc.

#### Uploading Files

1. Go to **Knowledge Base** in the sidebar
2. Click **Upload File**
3. Select a PDF or DOCX (max 10MB)
4. Orc will extract and index the content

**What you'll see:**
- File appears in the list with status "Extracting"
- After 10–30 seconds, status changes to "Ready"

#### Using the Knowledge Base

In the War Room, reference your uploads:
- `@orc read [filename]`
- `@orc summarize our brand guidelines`
- `@orc what does the spec say about [topic]?`

Orc will search the KB and cite the specific sections in its responses.

### 5. Departments (Team Management)

View and manage your activated departments.

#### Department Settings

Go to **Settings** → **Departments**:
- **View** each department's name, description, and capabilities
- **Model Assignment** (set which LLM model each department uses)
- **Add Departments** (activate more specialist teams)
- **Remove Departments** (deactivate if you don't need them)

#### Department Communication

Each department has a **communication style** configured during onboarding:
- **Careful:** Departments ask for approval before taking action
- **Balanced:** (Default) Departments take normal precautions; external actions require approval
- **Aggressive:** Departments execute more autonomously (still requires approval for external actions)

To change this, go to **Settings** → **Risk Tolerance**.

### 6. Tools & Integrations

Crost can take external actions on your behalf (send emails, create GitHub PRs, post to social media, etc.).

#### Connecting Services

Go to **Settings** → **Integrations**:
- **Connect** services (Gmail, GitHub, Notion, Slack, etc.)
- Follow OAuth prompts
- Once connected, Orc can execute actions

#### Tool Execution Workflow

1. Orc proposes a tool action (e.g., "Send this email")
2. An **Approval Card** appears with:
   - The tool name (e.g., `GMAIL_SEND_EMAIL`)
   - The action details (recipient, subject, body)
   - A risk level (low/medium/high)
3. You can **Approve**, **Deny**, or **Edit**
4. If approved, Orc executes the action and reports the result

**Security Note:** External actions ALWAYS require your approval. No exceptions.

### 7. Event Log (Activity Trail)

Every significant event in Crost is logged — goal creation, task execution, approvals, tool calls, errors, etc.

#### Viewing the Event Log

Go to **Event Log** in the sidebar. You'll see:
- **Timestamp** (when it happened)
- **Event Type** (e.g., `goal_created`, `task_started`, `approval_approved`, `action_executed`)
- **Details** (who/what/when, with traceable IDs)
- **Status** (success, error, pending)

This is useful for:
- **Auditing** what Orc did and when
- **Debugging** issues (e.g., why did a task fail?)
- **Compliance** (proving actions were approved)

---

## Workflow Examples

### Example 1: Write a Blog Post

1. **Start a mission:** "Write a blog post about our latest funding round"
2. **Orc plans:** Orchestrator breaks this into 3 tasks:
   - Research recent funding announcements and our narrative
   - Draft the blog post with compelling story arc
   - Design a header image
3. **Departments execute:**
   - Research dept gathers context from your memos and KB
   - Marketing dept drafts the post
   - Marketing dept generates an image (if connected to image API)
4. **You review:** Check the artifacts, read the post, review sources
5. **Export & share:** Download the DOCX and publish on your blog

### Example 2: Launch a Marketing Campaign

1. **Start:** "Plan and execute Q3 marketing campaign"
2. **Orc plans:** Multi-step plan including:
   - Define target audience and messaging
   - Create campaign materials (email templates, social graphics)
   - Set up email sequence
   - Post to social channels
3. **Approvals appear:** For each external action (send email, post to Twitter, etc.)
4. **You approve selectively:** Accept the email campaign, reject the aggressive Twitter posts, edit others
5. **Mission completes:** Final report shows what was executed and results

### Example 3: Quick Questions (Assistant Mode)

1. **Ask:** "Who are our target customers?" or "What's our company stage?"
2. **Orc responds directly:** No planning, no task creation — just a conversational answer
3. **This is "Assistant Mode"** — Orc recognizes conversational queries and responds without overhead

---

## End-to-End Testing Guide

Use this guide to verify the entire system is working correctly. Ideal for new users or QA testing.

### Test Setup

**Prerequisite:**
- Fresh account (just completed onboarding)
- At least 2 departments activated
- 5–10 minutes available

### Test 1: Signup & Auth (2 minutes)

- [ ] Sign up with Google/Apple (or email with OTP verification)
- [ ] Verify you land in onboarding identity
- [ ] Complete the 3-step flow (Name, Business, Stage)
- [ ] Verify Orc introduction screen appears
- [ ] Select 2 departments and advance to dashboard

**Expected result:** You're in the War Room with an empty goal list.

### Test 2: First Mission (5 minutes)

- [ ] Click the goal composer at the top
- [ ] Type: `"Create a brief product strategy outline"`
- [ ] Press Enter
- [ ] Watch the event feed — you should see "Preparing your mission…"
- [ ] After ~10 seconds, a plan card appears with 2–3 tasks
- [ ] Review each task's reasoning and deliverable
- [ ] Review the artifact preview (should be formatted nicely)

**Expected result:**
- Plan is sensible and task assignments make sense
- Final artifact is readable (DOCX preview, not raw JSON)
- No error messages in the event feed

### Test 3: Artifact Management (2 minutes)

- [ ] Go to **Artifacts**
- [ ] Click the artifact from Test 2
- [ ] Verify the preview is formatted correctly
- [ ] Click **Metadata** tab
- [ ] Verify you can see the parent goal ID and source memos/KB files
- [ ] Download the file (should be a valid DOCX)

**Expected result:**
- Preview renders correctly
- Download produces a real Office document
- All metadata is populated

### Test 4: Memos & Knowledge Base (2 minutes)

- [ ] Go to **Memos**
- [ ] Verify foundational memo exists (your company profile from onboarding)
- [ ] Go to **Knowledge Base**
- [ ] (Optional) Upload a test PDF or DOCX
- [ ] Verify file appears and shows "Extracting" → "Ready"

**Expected result:**
- Memos are searchable and editable
- KB upload works without errors
- No raw JSON or stack traces

### Test 5: Tool Approvals (2 minutes, requires integrations)

- [ ] Go to **Settings** → **Integrations**
- [ ] Connect Gmail (or another service)
- [ ] In the War Room, type: `@marketing "Draft and approve an outreach email"`
- [ ] Let a task complete that requires a tool approval
- [ ] Approval card appears in the right sidebar
- [ ] Review the action details
- [ ] Approve or deny (either choice is fine)

**Expected result:**
- Tool approval UI is clear and readable
- Action details match what was planned
- No permission errors or cryptic messages

### Test 6: Event Log & Observability (1 minute)

- [ ] Go to **Event Log**
- [ ] Verify recent events appear (goal_created, task_started, etc.)
- [ ] Click an event to expand details
- [ ] Verify you can trace IDs back to goals/tasks

**Expected result:**
- Event log shows clear chronological record
- All events have meaningful descriptions
- IDs are traceable and cross-linked

### Test 7: Assistant Mode (1 minute)

- [ ] In the War Room, type: `"What can you do?"`
- [ ] Orc should respond directly (no planning, no tasks)
- [ ] Type a follow-up: `"What's my company stage?"`
- [ ] Orc references your onboarding data

**Expected result:**
- Conversational questions don't trigger planning
- Orc correctly retrieves context from memos
- Responses are quick (< 5 seconds)

### Test 8: Department Status & Idle State (1 minute)

- [ ] Complete a mission (from Test 2)
- [ ] Watch the event feed until you see "Mission complete"
- [ ] Go to **Departments**
- [ ] Verify all departments show **Idle** status
- [ ] No stuck states or error indicators

**Expected result:**
- Clean transitions between states
- No departments hung or in error

### Success Criteria

If all 8 tests pass without:
- Raw JSON leaking into the UI
- Stuck departments or infinite loading
- Cryptic error codes
- Missing previews or broken downloads

**→ The system is SHIP-READY.**

---

## Troubleshooting

### "I'm stuck in onboarding"

**Problem:** Can't proceed past identity collection  
**Solution:**
- Refresh the page
- Check that you've filled in all three questions
- Try clearing browser cache

### "My goal is in 'Planning' forever"

**Problem:** Orc is taking more than 30 seconds  
**Solution:**
- Wait another 30 seconds (cold starts take time)
- Check the Event Log for errors
- If still stuck, refresh the page — the goal should resume
- If it truly hung, skip the goal and start a new one

### "A department shows 'Needs Data'"

**Problem:** A department is blocked and asking for something  
**Solution:**
- Click the department card to see the detailed message
- Common reasons: Missing API key, need more context from you
- Provide the requested info and retry the task

### "I don't see my artifact"

**Problem:** Task completed but no file appears  
**Solution:**
- Go to **Artifacts** tab (not War Room)
- Search by artifact type or date
- If nothing appears: Check the Event Log for a `task_failed` event
- Look for error messages in the associated task

### "Tool approval failed"

**Problem:** I approved a tool but got an error  
**Solution:**
- Verify the integration is still connected (Settings → Integrations)
- Check that the API key hasn't expired
- Review the error message in the Event Log for specifics
- If it's a quota issue (e.g., Gmail limit), wait and retry

### "I can't connect a service"

**Problem:** OAuth flow fails or integration won't save  
**Solution:**
- Ensure you've authorized Crost in the OAuth prompt
- Some services require additional setup (e.g., GitHub personal access tokens)
- Check the Integrations help text for service-specific instructions
- Try connecting a different service to test if the issue is global

### "Event Log shows errors but War Room looks fine"

**Problem:** Error logged but no visible impact  
**Solution:**
- This is expected — background tasks may fail (e.g., memo writes) but the core mission completes
- Click the error event to see details
- Contact support if errors are critical (marked with a warning icon)

### "Memos say something outdated"

**Problem:** A memo has stale information  
**Solution:**
- Go to **Memos**
- Click the memo and edit it directly
- Save the changes
- Orc will reference the updated memo in future missions

---

## Recommendations & Known Limitations

### Recommendations for New Users

1. **Complete the full onboarding.** Don't skip — it teaches you the system.
2. **Start with a simple goal.** Don't request 20 tasks in the first mission. Try "Create a one-page product overview" first.
3. **Review artifacts carefully.** Orc is good but not perfect. Always review and edit before sharing.
4. **Keep memos up to date.** Stale company context leads to stale outputs. Spend 5 minutes each week reviewing your foundational memos.
5. **Approve tool actions thoughtfully.** Orc asks for approval for external actions — take a moment to review each one.
6. **Use the Knowledge Base.** Upload key documents (brand guidelines, product spec, market research). Crost produces better work when it has context.
7. **Leverage Assistant Mode for quick questions.** Asking "What's our funding status?" is faster than creating a full mission.

### Known Limitations

1. **Image generation is limited.** Crost can reference image APIs but quality depends on the service connected. Custom image generation requires manual design for now.

2. **Real-time data is ~24 hours old.** Crost doesn't browse the internet live. It works best with uploaded context.

3. **External tool actions require approval.** Orc cannot send emails, create PRs, or post to social media without your explicit approval. This is intentional for safety.

4. **Artifact formatting is best-effort.** DOCX and XLSX are well-supported. PDFs are static (can't be edited in Crost). Specialized formats may need post-processing.

5. **Knowledge Base search is semantic, not exact.** If you ask "What does our spec say about authentication?" but the word "auth" appears nowhere in your docs, the search might miss it. Try synonyms if needed.

6. **Department model assignment is global.** If you set Research to use a slower model for higher accuracy, all Research tasks will use that model. Fine-grained per-task model selection coming in v12.

### Feature Requests / Post-MVP Roadmap

Common asks that are **not yet shipped**:

- [ ] **Undo/Rollback:** Revert a mission or specific task
- [ ] **Batch Operations:** Run multiple missions in sequence
- [ ] **Custom Departments:** Create your own specialist team with a custom prompt
- [ ] **Scheduled Goals:** "Every Monday, generate a weekly status report"
- [ ] **Collaborative Editing:** Share a goal with a team member and co-create
- [ ] **Advanced Artifact Editing:** Edit outputs inside Crost before download
- [ ] **Real-time Integrations:** Slack alerts, Slack commands to trigger goals, etc.
- [ ] **Audit Trail:** Export full activity log (HIPAA/SOC2 compliance)

---

## Quick Reference

### Keyboard Shortcuts

- **Cmd/Ctrl + K:** Open goal composer
- **Esc:** Close modals/dialogs
- **Cmd/Ctrl + /:** Search (coming soon)

### Sidebar Navigation

- **War Room:** Main command center (goals, tasks, approvals)
- **Artifacts:** All generated outputs (documents, spreadsheets, etc.)
- **Memos:** Company knowledge and context
- **Knowledge Base:** Uploaded files (PDFs, DOCX, etc.)
- **Departments:** Team management and settings
- **Event Log:** Full activity audit trail
- **Settings:** Account, integrations, preferences

### Help & Support

- **In-app help:** Click the **?** icon in the top right
- **Documentation:** This manual (open from Settings → Help)
- **Status:** `status.crosthq.com` for system health
- **Email:** support@crosthq.com

---

## What's Next?

After completing the onboarding:

1. **Try a real goal.** "Create a marketing calendar for Q3" or "Design our pricing strategy."
2. **Connect your tools.** Add Gmail, GitHub, Slack, or other services in Settings.
3. **Build your Knowledge Base.** Upload brand guidelines, competitive research, product specs.
4. **Invite your team.** (Coming soon) Collaborate with team members on goals.
5. **Set up alerts.** (Coming soon) Get notified when missions complete or approvals are needed.

---

**Enjoy building with Crost.**

For issues or feedback, reach out to [support@crosthq.com](mailto:support@crosthq.com) or open an issue on GitHub.

