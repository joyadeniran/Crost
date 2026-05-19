// lib/calendar-prep.ts
// Calendar & proactive prep engine — Phase 4 Week 7.
//
// Responsibilities:
//   1. getUpcomingEvents    — fetch events from DB within a look-ahead window
//   2. buildPrepChecklist   — rule-based checklist items per event type
//   3. getProactivePrepSuggestions — combine both into a surfaceable list

import { createServerSupabaseClient } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CalendarEventType =
  | 'investor_meeting'
  | 'customer_call'
  | 'board_meeting'
  | 'conference'
  | 'deadline'
  | 'other'

export interface CalendarEvent {
  id: string
  user_id: string
  type: CalendarEventType
  title: string
  date: string
  duration_minutes?: number
  attendees: string[]
  prep_required: string[]
  related_goals: string[]
  meeting_notes?: string
  outcomes?: string
  next_actions: string[]
  source: 'manual' | 'google_calendar'
  external_id?: string
  created_at: string
  updated_at: string
}

export interface PrepItem {
  label: string
  goalPrompt?: string  // pre-filled prompt if founder clicks "do this"
  priority: 'high' | 'medium' | 'low'
}

export interface PrepSuggestion {
  event: CalendarEvent
  daysUntil: number
  checklist: PrepItem[]
}

// ─── Static prep templates ────────────────────────────────────────────────────

const PREP_TEMPLATES: Record<CalendarEventType, PrepItem[]> = {
  investor_meeting: [
    { label: 'Update pitch deck with latest metrics', goalPrompt: 'Update our pitch deck with the latest traction, metrics, and milestones', priority: 'high' },
    { label: 'Generate metrics summary', goalPrompt: 'Create a concise metrics summary for an investor meeting: ARR, growth rate, burn, runway, key wins', priority: 'high' },
    { label: 'Draft talking points & likely Q&A', goalPrompt: 'Draft key talking points and answers to the most common Series A investor questions', priority: 'medium' },
    { label: 'Research attendees', priority: 'low' },
  ],
  customer_call: [
    { label: 'Summarise customer account history', goalPrompt: 'Summarise this customer\'s account history, usage, and any open issues', priority: 'high' },
    { label: 'Prepare call agenda', goalPrompt: 'Draft a concise agenda for a customer success call', priority: 'medium' },
    { label: 'Review open support tickets', priority: 'medium' },
    { label: 'Prepare expansion talking points', goalPrompt: 'Draft upsell or expansion talking points based on this customer\'s profile', priority: 'low' },
  ],
  board_meeting: [
    { label: 'Prepare board deck', goalPrompt: 'Create a board meeting presentation with financial performance, OKR progress, strategic updates, and asks', priority: 'high' },
    { label: 'Financial & runway summary', goalPrompt: 'Generate a financial summary with burn rate, runway, and cash position', priority: 'high' },
    { label: 'Review action items from last board meeting', priority: 'medium' },
    { label: 'Prepare written narrative (pre-read)', goalPrompt: 'Write a board pre-read memo covering progress, risks, and key decisions needed', priority: 'medium' },
  ],
  conference: [
    { label: 'Prepare speaker notes or talk track', goalPrompt: 'Draft speaker notes and a talk track for a conference presentation', priority: 'high' },
    { label: 'Identify key attendees to meet', priority: 'medium' },
    { label: 'Update one-pager or leave-behind', goalPrompt: 'Create a concise one-pager about the company for conference networking', priority: 'medium' },
  ],
  deadline: [
    { label: 'Review deliverable status', goalPrompt: 'Review the status of all open tasks related to this deadline and flag any risks', priority: 'high' },
    { label: 'Identify blockers', goalPrompt: 'Identify any blockers or dependencies that could prevent hitting this deadline', priority: 'high' },
    { label: 'Draft completion summary', priority: 'low' },
  ],
  other: [
    { label: 'Review any relevant context', priority: 'medium' },
    { label: 'Prepare notes', priority: 'low' },
  ],
}

// ─── getUpcomingEvents ────────────────────────────────────────────────────────

export async function getUpcomingEvents(
  userId: string,
  lookAheadDays = 7,
): Promise<CalendarEvent[]> {
  try {
    const supabase = createServerSupabaseClient()
    const now = new Date().toISOString()
    const until = new Date(Date.now() + lookAheadDays * 86_400_000).toISOString()

    const { data, error } = await supabase
      .from('company_calendar_events')
      .select('*')
      .eq('user_id', userId)
      .gte('date', now)
      .lte('date', until)
      .order('date', { ascending: true })

    if (error || !data) return []
    return data as CalendarEvent[]
  } catch {
    return []
  }
}

// ─── buildPrepChecklist ───────────────────────────────────────────────────────

export function buildPrepChecklist(event: CalendarEvent): PrepItem[] {
  const base = PREP_TEMPLATES[event.type] ?? PREP_TEMPLATES.other

  // Merge any event-specific prep_required items (stored by the calendar sync or founder)
  const extra: PrepItem[] = event.prep_required
    .filter(label => !base.some(b => b.label.toLowerCase() === label.toLowerCase()))
    .map(label => ({ label, priority: 'medium' as const }))

  return [...base, ...extra]
}

// ─── getProactivePrepSuggestions ──────────────────────────────────────────────

export async function getProactivePrepSuggestions(
  userId: string,
  lookAheadDays = 7,
): Promise<PrepSuggestion[]> {
  const events = await getUpcomingEvents(userId, lookAheadDays)
  const now = Date.now()

  return events.map(event => {
    const msUntil = new Date(event.date).getTime() - now
    const daysUntil = Math.max(0, Math.ceil(msUntil / 86_400_000))
    return {
      event,
      daysUntil,
      checklist: buildPrepChecklist(event),
    }
  })
}
