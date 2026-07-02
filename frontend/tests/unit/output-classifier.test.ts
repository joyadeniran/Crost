/**
 * Unit tests: lib/output-classifier.ts — classifyOutput tier decisions.
 */
import { describe, it, expect } from 'vitest'
import { classifyOutput } from '@/lib/output-classifier'

describe('classifyOutput', () => {
  it('classifies system-prompt-like content as internal', () => {
    const result = classifyOutput({ content: '# SKILL: Email drafting\nAlways use a friendly tone.' })
    expect(result.tier).toBe('internal')
  })

  it('classifies "you must always" directive language as internal', () => {
    const result = classifyOutput({ content: 'You must always include a subject line.' })
    expect(result.tier).toBe('internal')
  })

  it('does not classify email content as internal even if it matches directive language', () => {
    const result = classifyOutput({
      content: 'You must always confirm before shipping.',
      contentType: 'email',
    })
    expect(result.tier).not.toBe('internal')
  })

  it('classifies a task-hint mentioning "skill guide" as internal', () => {
    const result = classifyOutput({ content: 'Some content', taskHint: 'Update the skill guide for marketing' })
    expect(result.tier).toBe('internal')
  })

  it('classifies small txt operational-pattern content as operational', () => {
    const result = classifyOutput({
      content: 'Email sent and delivered to the recipient.',
      targetFormat: 'txt',
    })
    expect(result.tier).toBe('operational')
  })

  it('classifies small tool_execution email confirmations as operational', () => {
    const result = classifyOutput({
      content: 'short confirmation',
      contentType: 'email',
      sourceType: 'tool_execution',
      fileSizeBytes: 100,
    })
    expect(result.tier).toBe('operational')
  })

  it('classifies binary files as deliverable regardless of size', () => {
    const result = classifyOutput({ content: '', isBinaryFile: true })
    expect(result.tier).toBe('deliverable')
  })

  it('classifies explicit formatted output types (docx, xlsx, etc.) as deliverable', () => {
    for (const fmt of ['docx', 'xlsx', 'pptx', 'pdf', 'csv', 'py', 'sql', 'ts', 'js']) {
      const result = classifyOutput({ content: 'x', targetFormat: fmt })
      expect(result.tier).toBe('deliverable')
    }
  })

  it('classifies large structured department output as deliverable', () => {
    const result = classifyOutput({
      content: 'x'.repeat(1500),
      departmentSlug: 'sales',
      fileSizeBytes: 1500,
    })
    expect(result.tier).toBe('deliverable')
  })

  it('classifies large markdown as deliverable', () => {
    const result = classifyOutput({
      content: 'x'.repeat(1500),
      targetFormat: 'md',
      fileSizeBytes: 1500,
    })
    expect(result.tier).toBe('deliverable')
  })

  it('falls back to deliverable (conservative default) when nothing matches', () => {
    const result = classifyOutput({ content: 'plain unclassified text' })
    expect(result.tier).toBe('deliverable')
    expect(result.reason).toMatch(/default/i)
  })

  it('computes fileSizeBytes from content when not provided', () => {
    const result = classifyOutput({ content: 'x'.repeat(2000), departmentSlug: 'marketing' })
    expect(result.tier).toBe('deliverable')
  })
})
