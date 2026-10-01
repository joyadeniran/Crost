/**
 * Unit tests: lib/suggested-actions.ts — generateAndInsertSuggestedActions.
 * Phase 5 (10x rebuild). The pre-existing tests/unit/suggested-actions.test.ts
 * is tautological (asserts local literals against themselves, never calls
 * this function) — left untouched per "extend, don't delete", but this file
 * is the first REAL behavioral coverage of the generator, added alongside
 * the schedule_recurring fix (spec §6.1: "Conditionally include
 * schedule_recurring if the mission type supports periodic regeneration").
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let insertedRows: any[] = []

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn((rows: any[]) => {
        insertedRows = rows
        return {
          select: vi.fn(() => Promise.resolve({
            data: rows.map((_, i) => ({ id: `sa-${i}` })),
            error: null,
          })),
        }
      }),
    })),
  })),
}))

import { generateAndInsertSuggestedActions } from '@/lib/suggested-actions'

beforeEach(() => {
  insertedRows = []
})

function slugs() {
  return insertedRows.map((r) => r.action_slug)
}

describe('generateAndInsertSuggestedActions', () => {
  it('always includes make_changes and add_to_memo', async () => {
    await generateAndInsertSuggestedActions({
      source_entity_type: 'mission_report',
      source_entity_id: 'mr-1',
      created_by: 'user-1',
    })
    expect(slugs()).toContain('make_changes')
    expect(slugs()).toContain('add_to_memo')
  })

  it('never offers save_to_kb — the knowledge base was cut from the beta', async () => {
    await generateAndInsertSuggestedActions({
      source_entity_type: 'artifact',
      source_entity_id: 'art-1',
      file_url: 'https://storage/x.pptx',
      created_by: 'user-1',
    })
    expect(slugs()).not.toContain('save_to_kb')
  })

  it('includes send_to_email for shareable artifact types with a file_url', async () => {
    await generateAndInsertSuggestedActions({
      source_entity_type: 'artifact',
      source_entity_id: 'art-1',
      artifact_type: 'presentation',
      file_url: 'https://storage/x.pptx',
      created_by: 'user-1',
    })
    expect(slugs()).toContain('send_to_email')
  })

  it('omits send_to_email for non-shareable artifact types', async () => {
    await generateAndInsertSuggestedActions({
      source_entity_type: 'artifact',
      source_entity_id: 'art-1',
      artifact_type: 'code',
      file_url: 'https://storage/x.py',
      created_by: 'user-1',
    })
    expect(slugs()).not.toContain('send_to_email')
  })

  // ─── schedule_recurring (Phase 5 fix) ────────────────────────────────────
  it.each([
    'Weekly sales pipeline summary for the founder',
    'Run a competitor analysis on our top 3 rivals',
    'Generate our monthly metrics report',
  ])('never offers schedule_recurring — recurring missions were cut (%s)', async (mission_context) => {
    await generateAndInsertSuggestedActions({
      source_entity_type: 'mission_report',
      source_entity_id: 'mr-1',
      mission_context,
      artifact_title: 'Weekly competitor check',
      created_by: 'user-1',
    })
    expect(slugs()).not.toContain('schedule_recurring')
  })
})
