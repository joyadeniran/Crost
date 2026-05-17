// lib/capability-checker.ts
// Brain 3 (Realism): checks capability_inventory for gaps and surfaces external service options.
// Part of ORC_ORCHESTRATION_UPGRADE_PLAN.md §B.3 (Phase 2, Week 3).
// Server-side ONLY — never import from a client component.

import { createServerSupabaseClient } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExternalServiceOption {
  service_name: string
  recommended_vendors: string[]
  estimated_cost_range: string | null
  turnaround_time: string | null
  founder_decision_required: boolean
}

export interface CapabilityGap {
  slug: string
  name: string
  capability_type: string
  availability: 'partial' | 'unavailable'
  notes: string | null
  external_service?: ExternalServiceOption
}

export interface CapabilitySummary {
  available: string[]
  partial: string[]
  gaps: CapabilityGap[]
  promptText: string
}

const EMPTY_SUMMARY: CapabilitySummary = { available: [], partial: [], gaps: [], promptText: '' }

// ─── Gap detection ────────────────────────────────────────────────────────────

/**
 * Loads capability_inventory + external_services, then identifies gaps
 * relevant to the given intent using keyword overlap.
 * Fail-open — returns empty summary on any DB error.
 */
export async function detectCapabilityGaps(intent: string): Promise<CapabilitySummary> {
  try {
    const supabase = createServerSupabaseClient()

    const [capsRes, extRes] = await Promise.all([
      supabase
        .from('capability_inventory')
        .select('capability_slug, display_name, capability_type, availability_status, description, skill_tags, notes'),
      supabase
        .from('external_services')
        .select('service_name, category, when_to_use, recommended_vendors, estimated_cost_range, turnaround_time, founder_decision_required, related_capability_slug')
        .eq('status', 'available'),
    ])

    const caps = (capsRes.data ?? []) as Array<{
      capability_slug: string
      display_name: string
      capability_type: string
      availability_status: 'available' | 'available_with_tools' | 'partial' | 'unavailable'
      description: string | null
      skill_tags: string[]
      notes: string | null
    }>

    const extServices = (extRes.data ?? []) as Array<{
      service_name: string
      category: string
      when_to_use: string | null
      recommended_vendors: string[]
      estimated_cost_range: string | null
      turnaround_time: string | null
      founder_decision_required: boolean
      related_capability_slug: string | null
    }>

    // Index external services by their related capability slug
    const extBySlug = new Map<string, ExternalServiceOption>()
    for (const svc of extServices) {
      if (svc.related_capability_slug) {
        extBySlug.set(svc.related_capability_slug, {
          service_name: svc.service_name,
          recommended_vendors: svc.recommended_vendors ?? [],
          estimated_cost_range: svc.estimated_cost_range,
          turnaround_time: svc.turnaround_time,
          founder_decision_required: svc.founder_decision_required,
        })
      }
    }

    const intentWords = new Set(
      intent.toLowerCase().split(/\W+/).filter(w => w.length > 3)
    )

    const available: string[] = []
    const partial: string[] = []
    const gaps: CapabilityGap[] = []

    for (const cap of caps) {
      const status = cap.availability_status

      if (status === 'available' || status === 'available_with_tools') {
        available.push(cap.display_name)
        continue
      }

      const capText = [
        cap.display_name,
        cap.description ?? '',
        ...(cap.skill_tags ?? []),
      ].join(' ').toLowerCase()

      const isRelevant = Array.from(intentWords).some(w => capText.includes(w))

      if (status === 'partial') {
        if (isRelevant) partial.push(cap.display_name)
      } else if (status === 'unavailable' && isRelevant) {
        gaps.push({
          slug: cap.capability_slug,
          name: cap.display_name,
          capability_type: cap.capability_type,
          availability: 'unavailable',
          notes: cap.notes,
          external_service: extBySlug.get(cap.capability_slug),
        })
      }
    }

    const promptText = formatCapabilityGapsForPrompt({ available, partial, gaps, promptText: '' })
    return { available, partial, gaps, promptText }
  } catch (err) {
    console.error('[detectCapabilityGaps] Error (non-fatal):', err)
    return EMPTY_SUMMARY
  }
}

// ─── Prompt formatter ─────────────────────────────────────────────────────────

/**
 * Converts a CapabilitySummary into a compact text block for injection into
 * the Orc prompt. Only surfaces gaps — available capabilities are silent.
 */
export function formatCapabilityGapsForPrompt(summary: CapabilitySummary): string {
  const parts: string[] = []

  if (summary.gaps.length > 0) {
    const gapLines = summary.gaps.map(g => {
      if (g.external_service) {
        const svc = g.external_service
        const vendors = svc.recommended_vendors.slice(0, 2).join('/')
        const cost = svc.estimated_cost_range ?? 'cost unknown'
        const time = svc.turnaround_time ?? 'timeline unknown'
        return `- ${g.name} (${g.slug}): UNAVAILABLE internally. External option: ${svc.service_name} via ${vendors} — ${cost}, ${time}, founder approval required.`
      }
      return `- ${g.name} (${g.slug}): UNAVAILABLE — no external option configured. Consider escalating or scoping down.`
    })
    parts.push(`CAPABILITY GAPS DETECTED:\n${gapLines.join('\n')}`)
  }

  if (summary.partial.length > 0) {
    parts.push(`PARTIAL CAPABILITIES (limited support): ${summary.partial.join(', ')}`)
  }

  return parts.join('\n\n')
}
