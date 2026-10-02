/**
 * Unit tests: lib/storage.ts — Supabase Storage adapter keeps the old gcsStorage contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const api = {
  upload: vi.fn(), download: vi.fn(), remove: vi.fn(), copy: vi.fn(),
}
const fromBucket = vi.fn(() => api)
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ storage: { from: fromBucket } }) }))

import { appStorage } from '@/lib/storage'

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  fromBucket.mockClear()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co'
})

describe('appStorage.from(bucket)', () => {
  it('uploads under <logical-bucket>/<path> in the single private bucket and returns the relative path', async () => {
    api.upload.mockResolvedValue({ error: null })
    const res = await appStorage.from('artifacts').upload('goals/g1/report.docx', Buffer.from('x'), { contentType: 'application/pdf' })
    expect(fromBucket).toHaveBeenCalledWith('crost')
    expect(api.upload).toHaveBeenCalledWith('artifacts/goals/g1/report.docx', expect.any(Buffer), expect.objectContaining({ contentType: 'application/pdf', upsert: true }))
    expect(res).toEqual({ data: { path: 'goals/g1/report.docx' }, error: null })
  })

  it('wraps a string body in a Buffer and surfaces upload errors', async () => {
    api.upload.mockResolvedValue({ error: { message: 'quota' } })
    const res = await appStorage.from('artifacts').upload('a.txt', 'hello')
    expect(Buffer.isBuffer(api.upload.mock.calls[0][1])).toBe(true)
    expect(res.data).toBeNull()
    expect(res.error?.message).toBe('quota')
  })

  it('getPublicUrl yields a reference URL whose "/artifacts/" marker the download route can split on', () => {
    const { data } = appStorage.from('artifacts').getPublicUrl('goals/g1/r.pdf')
    expect(data.publicUrl).toBe('https://proj.supabase.co/storage/v1/object/crost/artifacts/goals/g1/r.pdf')
    expect(data.publicUrl.slice(data.publicUrl.indexOf('/artifacts/') + '/artifacts/'.length)).toBe('goals/g1/r.pdf')
  })

  it('getObject collapses a redundant leading logical-bucket prefix (no double prefix)', async () => {
    api.download.mockResolvedValue({ data: new Blob(['abc']), error: null })
    const res = await appStorage.from('artifacts').getObject('artifacts/artifacts/goals/g1/r.pdf')
    expect(api.download).toHaveBeenCalledWith('artifacts/goals/g1/r.pdf')
    expect(res.data?.toString()).toBe('abc')
  })

  it('getObject falls back to the pre-beta bucket named after the logical bucket', async () => {
    api.download
      .mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } })
      .mockResolvedValueOnce({ data: new Blob(['old']), error: null })
    const res = await appStorage.from('artifacts').getObject('goals/g1/r.pdf')
    expect(fromBucket).toHaveBeenLastCalledWith('artifacts')
    expect(api.download).toHaveBeenLastCalledWith('goals/g1/r.pdf')
    expect(res.data?.toString()).toBe('old')
  })

  it('getObject returns an error object (never throws) when the file is missing', async () => {
    api.download.mockResolvedValue({ data: null, error: { message: 'Object not found' } })
    const res = await appStorage.from('artifacts').getObject('missing.pdf')
    expect(res.data).toBeNull()
    expect(res.error?.message).toMatch(/not found/i)
  })

  it('remove and copy re-prepend the logical bucket', async () => {
    api.remove.mockResolvedValue({ error: null })
    api.copy.mockResolvedValue({ error: null })
    await appStorage.from('artifacts').remove(['a.pdf', 'b.pdf'])
    expect(api.remove).toHaveBeenCalledWith(['artifacts/a.pdf', 'artifacts/b.pdf'])
    await appStorage.from('artifacts').copy('a.pdf', 'v2/a.pdf')
    expect(api.copy).toHaveBeenCalledWith('artifacts/a.pdf', 'artifacts/v2/a.pdf')
  })
})
