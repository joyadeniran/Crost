
# CROST SPEC — Product + System Rewrite Draft

>  This is the source of truth for Crost architecture.
> Do not modify without founder approval.
> Existing implementation details, APIs, DB structures, and routes should only be updated where they already align with current behavior.
> Do not assume undocumented schema changes.
> Updated April 20, 2026: Rewritten to align with the current realities.
---

# 0. Core Philosophy

Crost is not a chatbot.

Crost is a Human-in-the-loop Company Operating System where AI simulates departments, coordinated by a central Chief of Staff (Orc), to help a founder run a company.

The goal is not task automation for its own sake.

The goal is to help founders think better, operate faster, and execute more consistently.

Crost must always preserve:

- Clarity
- Control
- Founder trust
- Visibility
- Human approval
- Useful outputs over novelty

---

# 1. Product Principles

Crost should feel like an office, not a chatbot.

The founder should feel like they are operating through one intelligent layer, not juggling many disconnected assistants.

Product rules:

- Orc is the primary interface layer
- Departments exist mostly behind the scenes
- Users should reach value quickly
- Users should never hit dead ends
- Users should always understand what happens next
- Every mission should lead to a next step
- External actions require approval
- Crost should feel operational, not conversational for the sake of conversation
- Crost should guide confused users without overwhelming them
- Crost should stay useful even when the founder is not actively chatting

---

# 2. First-Time User Journey

## Landing Page

The landing page should communicate:

- Crost is an AI company operating system
- Orc is the founder's Chief of Staff
- Departments help execute work
- Founders remain in control
- External actions require approval

Primary CTAs:

- Start Free
- See Demo

The demo path is important for skeptical users who want proof before signup.

## Authentication

Preferred auth methods:

- Google
- Apple
- Email/password fallback

Rules:

- Keep auth friction low
- Do not require email verification before onboarding
- Allow verification later
- Do not force OTP before first value

## Onboarding

The onboarding flow should feel like Crost is learning about the founder, not interrogating them.

Suggested onboarding sequence:

1. Founder name
2. Company name
3. Location
4. What the company does
5. Team size
6. Department selection

The onboarding UI should:

- Autofill where possible
- Translate vague answers into structured company context
- Update a live company profile summary in real time
- Make the founder feel understood

Before department selection, Crost introduces Orc.

Suggested copy:

"Meet Orc (short for Orchestrator) your AI Chief of Staff. Orc plans work, coordinates departments, and helps you run your company."

Then explain departments:

"Departments are specialist teams Orc can activate when needed."

Department selection rules:

- Auto-select recommended departments
- Require a minimum number of active departments
- Explain each department in one sentence
- Allow departments to be added later

## Suggested First Mission

After onboarding, Crost should immediately generate a suggested first mission.

Examples:

- Create a pitch deck
- Build an outreach plan
- Draft a go-to-market strategy
- Create a company profile
- Generate customer personas
- Create a process document

The first mission should:

- Feel highly relevant
- Produce visible output
- Take less than a few minutes
- Create a clear success moment

## Processing Experience

Instead of only showing "Orc is planning" while work is happening:

- The dashboard should already be accessible
- The product should not feel empty
- Live events should make the system feel alive
- The founder should always know what is happening

Example status text:

- Preparing your first mission
- Drawing strategy
- Coordinating departments
- Drafting artefacts
- Reviewing company context
- Building your war room

Avoid:

- Fake percentages
- Infinite spinners
- Aggressive military language
- Long unexplained delays

## First Success Moment

When the first mission completes, the founder should receive:

- A generated artefact
- A Mission Report
- A clear summary of what happened
- Suggested next actions

Suggested Orc message:

"Your pitch deck is ready. I’ve attached the presentation and saved a Mission Report with the strategy behind it. You can review it, send it by email, or save it to your knowledge base."

---

# 3. User States & Lifecycle

Users may exist in several experience states:

- Pre-auth
- Authenticated
- Onboarding incomplete
- Onboarding complete
- First mission pending
- First mission running
- First mission complete
- Active user
- Dormant user
- Returning user
- Unverified user

These states determine:

- What pages are visible
- What actions are locked
- What Orc suggests
- Which lifecycle emails are triggered
- Which empty states are shown

Incomplete onboarding should never leave the user stranded.

Instead, Crost should:

- Preserve progress
- Show a resume setup state
- Keep the dashboard partially accessible
- Suggest next actions clearly

---

# 4. Orc (Orchestrator)

Orc is the founder's AI Chief of Staff.

Orc is not just an assistant.

Orc is responsible for:

- Understanding founder goals
- Generating strategy
- Breaking work into tasks
- Coordinating departments
- Maintaining company memory
- Managing execution
- Suggesting next steps
- Requesting approval when needed
- Helping the founder make decisions
- Acting like a lightweight assistant when useful

Orc should feel:

- Competent
- Helpful
- Concise
- Proactive
- Calm
- Trustworthy

Orc should not feel:

- Overly chatty
- Too robotic
- Too playful
- Too verbose
- Like a normal customer support bot

Orc may also perform assistant-style actions when useful:

- Send this to my email
- Save this to the knowledge base
- Remind me later
- Connect Gmail
- Rename this artefact
- Summarize this report

The user should still feel like Orc handled these actions directly, even if other systems run in the background.

---

# 5. Departments

Departments are specialist teams Orc can activate when needed.

Departments are not independent agents competing for control.

Departments:

- Read from the Memo
- Write to the Memo
- Produce artefacts
- Execute focused work
- Do not override Orc decisions

Examples:

- Marketing
- Sales
- Operations
- Engineering
- Finance
- Legal
- Customer Support

Departments should remain mostly invisible unless:

- The founder chats with one directly
- A department must be activated
- A department is producing a specific output
- A department requests approval

Users should never feel like they must memorize department names.

Orc should remain the primary interface layer.

---

# 6. Missions

A Mission is a goal Orc is actively executing.

Missions may involve:

- One department
- Multiple departments
- Artefacts
- Tool calls
- Approvals
- Follow-up work

Mission rules:

- Every mission should have a clear objective
- Every mission should have a visible status
- Every mission should produce a useful result
- Every mission should end with suggested next steps

Example mission statuses:

- Pending
- Running
- Waiting for approval
- Completed
- Failed
- Cancelled

---

# 7. Mission Reports

Mission Reports replace post-mortems.

Mission Reports act as the readable memory of work completed inside Crost.

Mission Reports should explain:

- What the mission was
- Which departments were involved
- Which outputs were created
- Which approvals were requested
- What succeeded
- What failed
- What should happen next

Mission Reports should be created after:

- Successful missions
- Failed missions
- Partial completions

Mission Reports should be accessible later so the founder can revisit work history.

---

# 8. Memo

The Memo is Crost's memory of the company.

The Memo stores:

- Company profile
- Active goals
- Strategies
- Task history
- Decisions
- Department notes
- References to artefacts
- References to Mission Reports

Rules:

- Every task reads from the Memo
- Every task writes back to the Memo
- Orc reviews the Memo before making important decisions
- The Memo should remain concise and useful
- The Memo should not become a dump of raw data

The founder should feel like Crost remembers context over time.

---

# 9. Artefacts

Artefacts are generated outputs.

Examples:

- Documents
- Presentations
- Spreadsheets
- PDFs
- Images
- Reports

Rules:

- Long outputs become artefacts
- Downloadable files become artefacts
- Memo stores references, not full file contents
- Every artefact should be tied to a mission

The first artefact matters more than almost anything else in the MVP experience.

It should:

- Look useful
- Feel valuable
- Be easy to review
- Create a reason to come back

---

# 10. Knowledge Base

The Knowledge Base is the founder-controlled document store.

Purpose:

- Store company documents
- Provide context to Orc and departments
- Preserve important files
- Avoid polluting the Memo with raw document contents

The Knowledge Base is not a replacement for the Memo.

Difference:

- Memo = current company state
- Knowledge Base = uploaded company documents
- Artefacts = generated outputs

Examples of Knowledge Base content:

- Pitch decks
- Financial reports
- Customer research
- Brand guidelines
- Contracts
- Handbooks
- Meeting notes

---

# 11. Inbox & Approvals

The Inbox is where founders review:

- Notifications
- Approval requests
- Important updates
- Pending actions

Approvals are embedded into the Inbox experience.

Nothing external should happen without approval unless the product later introduces optional risk modes.

Examples requiring approval:

- Sending email
- Posting to Slack
- Pushing to GitHub
- Editing CRM data
- Publishing content
- Connecting external systems

The founder should always feel in control.

Suggested trust copy:

"Crost never performs external actions without your approval."

---

# 12. Tool Connections

Tool connections allow Crost to interact with external systems.

Examples:

- Gmail
- Slack
- GitHub
- HubSpot
- Calendar
- Notion
- Linear

Composio is the current connection layer.

Orc should introduce tools contextually.

Example:

"I can send this to your email, but first I need access to Gmail."

Tool requests should happen only when relevant, not all at once during onboarding.

---

# 13. Dashboard Structure

The dashboard should remain usable even while missions are running.

Core areas:

- War Room
- Memo
- Artefacts
- Inbox
- Knowledge Base
- Departments
- Settings

The dashboard should never feel empty.

Even for brand-new users, Crost should show:

- Suggested first mission
- Onboarding summary
- Selected departments
- Live events
- Placeholder artefacts
- Helpful empty states

---

# 14. War Room

The War Room is the founder's primary workspace.

The War Room is where:

- Founders talk to Orc
- Missions are created
- Live progress is shown
- Departments are activated
- Tool requests appear
- Follow-up work happens

The War Room should feel:

- Fast
- Alive
- Useful
- Easy to understand

The founder should never feel like they are talking to multiple disconnected systems.

---

# 15. Interaction Rules

Crost supports three interaction modes:

1. Standard Orc conversation
2. Direct department chat using @department
3. Tool invocation using /tool.action

Rules:

- No prefix = Orc flow
- @department = direct specialist request
- /tool.action = direct tool invocation

The system should always make it clear what is happening and why.

---

# 16. Human-in-the-Loop

Human approval is a foundational principle.

Nothing external should happen without approval.

Approval should be required for:

- Email sending
- Slack messages
- CRM updates
- Publishing
- Code pushes
- Calendar invites
- Data deletion
- File exports

The founder must remain in control.

---

# 17. Empty States & UX Rules

Every page should explain itself clearly.

Examples:

War Room:
- "Start your first mission"
- "Ask Orc anything about your company"

Artefacts:
- "Your generated files will appear here"

Knowledge Base:
- "Upload documents Orc can reference later"

Inbox:
- "Nothing needs your attention right now"

Memo:
- "Crost will automatically build memory as you work"

Departments:
- "Activate specialist teams when you need them"

Settings:
- "Control integrations, keys, models, and preferences"

---

# 18. Failure Recovery & Edge Cases

Crost should recover gracefully when something goes wrong.

Examples:

- Missing department
- Failed tool connection
- Timeout
- Weak artefact
- Missing company information
- Unverified email
- Impossible request
- Harmful request

Rules:

- Never expose raw technical failures
- Explain problems clearly
- Suggest a retry or fallback
- Keep the founder moving forward

Unsafe requests should be declined calmly and redirected where possible.

Example:

"I cannot help with illegal or harmful actions. If your goal is security, recovery, or fraud prevention, I can help with that instead."

---

# 19. Usage Limits & Verification

Unverified users may still:

- Complete onboarding
- Run their first mission
- Generate artefacts
- Explore the dashboard

However, some actions should remain restricted until verification:

- Sending emails
- Connecting tools
- Sensitive exports
- Account recovery
- Future collaboration features

Suggested banner:

"Verify your email to unlock sending, integrations, and recovery."

---

# 20. Future Systems

Future areas may include:

- Contacts
- Dispatch mobile app
- Social listening
- Customer complaint ingestion
- CRM sync
- WhatsApp
- Calendar sync
- Meeting notes
- External inbox monitoring
- Skills layer
- Marketplace
- Autonomous mode

## Contacts

Contacts may later help Orc remember:

- Investors
- Customers
- Partners
- Lawyers
- Vendors
- Team members

This allows the founder to say things like:

- Send this to Sarah
- Save this investor
- Draft a follow-up for David
- Remember our lawyer's details

## Dispatch

Dispatch is the future mobile experience.

Desktop = full office
Mobile = direct line to Orc

Dispatch should support:

- Voice notes
- Images
- Videos
- Text instructions
- Notifications
- Quick approvals
- Mission updates

The founder should be able to give Orc instructions from anywhere.

---

# 21. Explicit Non-Goals

Do not build:

- Complex agent hierarchies
- Fully autonomous execution by default
- Endless retry loops
- Real-time multi-user collaboration
- Excessive gamification
- Multiple competing assistants
- Features that reduce founder trust
