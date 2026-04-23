# SKILL: pitch_deck — Founder-Grade Pitch Deck

## Purpose
This is a **meta-skill** that composes the `pptx` skill with founder-grade pitch deck structure.
You MUST follow all rules in the `pptx` SKILL.md AND the additional rules in this file.
Pitch decks are the single most important artefact in MVP — the first one a founder sees defines whether they come back.

## When this skill applies
- Task action contains: `create_pitch_deck`, `build_pitch`, `create_investor_deck`, `generate_pitch`
- Task label or expected deliverable references "pitch", "investor deck", "fundraising deck", "seed deck", "series A deck"
- This skill always co-loads with `pptx`

## Mandatory slide structure

A founder-grade pitch deck has these slides in this order. Do not reorder. Do not omit any.

| # | Slide | Layout | Purpose |
|---|-------|--------|---------|
| 1 | **Cover** | `title` | Company name, one-line tagline, date |
| 2 | **Problem** | `content` | The specific pain point, in the customer's words |
| 3 | **Solution** | `content` | What Crost does — concrete, not abstract |
| 4 | **Why Now** | `content` | Market timing, regulatory shift, technology unlock |
| 5 | **Market Size** | `two_column` | TAM / SAM / SOM with actual $ figures |
| 6 | **Product** | `content` or `image_placeholder` | How it works — 3–5 feature bullets max |
| 7 | **Traction** | `content` | Metrics: users, revenue, growth rate, pilots, waitlist |
| 8 | **Business Model** | `content` | How you make money — pricing, margins, LTV/CAC if available |
| 9 | **Go-to-Market** | `content` | First 12 months: who, how, channel |
| 10 | **Competition** | `two_column` | Competitor landscape — left: them, right: your differentiation |
| 11 | **Team** | `content` | Founder(s) + key hires — credibility > completeness |
| 12 | **The Ask** | `content` | How much raising, what it buys, 18-month milestones |
| 13 | **Citations** | `citations` | Sources used (auto-required by `pptx` skill) |

You may add 1–2 slides between any adjacent pair above (e.g. a Demo slide between Product and Traction), but you may NOT remove or reorder the mandatory 12 content slides.

## Slide-by-slide guidance

### Slide 2 — Problem
- Open with a single, vivid sentence in the voice of the customer.
- Use 3 bullets maximum. Each bullet names ONE specific pain, not a vague category.
- Do NOT use "there is a problem with X" — show the problem with evidence or anecdote.
- Example good bullet: "Founders spend 6 hours/week manually compiling board reports"
- Example bad bullet: "Reporting is inefficient"

### Slide 3 — Solution
- The first bullet must be a one-sentence positioning statement: "[Company] is [category] that [specific action] for [specific customer]."
- Subsequent bullets (2–4 max) describe the 2–3 most powerful features.
- Do NOT list everything the product does — pick the most compelling proof points.

### Slide 5 — Market Size
- Use `two_column` layout with `left` containing TAM/SAM and `right` containing SOM.
- Always provide actual dollar figures (estimate conservatively if exact numbers unknown).
- Cite source if figures are from a KB file or memo.

### Slide 7 — Traction
- Traction is the most important slide for seed and Series A.
- **If there is real traction**: lead with the best metric, then growth rate, then secondary metrics.
- **If there is no traction yet**: show waitlist signups, pilot companies, letters of intent, or design partner quotes. Never leave this slide empty or generic.
- Add `notes` explaining what each metric means.

### Slide 10 — Competition
- Use `two_column` layout.
- Left column: 3–5 competitors or alternatives, each with 1-bullet weakness.
- Right column: 1–2 bullets per competitor explaining your differentiation against them.
- Do NOT say "no real competitors" — every product has alternatives (including doing nothing).

### Slide 11 — Team
- Each team member: Name, Role, 1-line credential (not bio).
- "Serial founder, previously X" beats five lines of biography.
- If the founder is the only team member, project the next 2 key hires.

### Slide 12 — The Ask
- Be specific: "$1.5M pre-seed at $8M cap" not "raising a pre-seed round".
- 3–5 bullets for use of funds: "40% engineering", "35% GTM", "25% ops/legal".
- 3 milestone bullets for 18 months: clear, measurable outcomes.

## Content quality rules

1. **Use real company context**: always read the company memo and KB before generating. Placeholders are unacceptable.
2. **Ground every claim**: if you use a market figure, cite it. If it's an estimate, say so.
3. **Jargon ban**: no "synergies", "paradigm shifts", "solutions", "leverage", "utilize". Write like a smart person talking to another smart person.
4. **Tense consistency**: present tense throughout (we do X, not we will do X), unless describing future milestones.
5. **Numbers beat adjectives**: "3× faster" beats "significantly faster". "12 design partners" beats "strong early traction".

## Anti-patterns specific to pitch decks

- ❌ Generic taglines like "Transforming the future of X" — be specific
- ❌ A "Vision" slide that is not on the mandatory list — fold vision into Cover tagline + Problem
- ❌ Financials projections slide in pre-seed decks unless explicitly requested
- ❌ A "Thank You" slide — never. The ask slide is always last (before citations)
- ❌ More than 2 lines of text in any given bullet
- ❌ Logos of future customers before they are signed — only show confirmed pilots/partners

## Citation instruction

Same as `pptx` SKILL.md. The citations slide (slide 13) must list:
- Every memo that informed facts, strategy, or market context
- Every KB file referenced (pitch decks, research, financials)
- Every external tool call used (web search, CRM pull, etc.)

Investors may ask where numbers came from. The citations slide is the founder's defence.
