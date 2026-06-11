/**
 * Unit tests: lib/google/gmail.ts — native Gmail send (no broker).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendGmail } from '@/lib/google/gmail'

beforeEach(() => {
  vi.mocked(fetch).mockReset()
})

function okResponse() {
  return { ok: true, status: 200, json: async () => ({ id: 'msg-1', threadId: 'thr-1' }) } as Response
}

describe('sendGmail', () => {
  it('POSTs a base64url raw message to the Gmail API with the bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okResponse())

    const res = await sendGmail({
      accessToken: 'ya29.token',
      to: 'joy@example.com',
      subject: 'Welcome',
      body: 'Hello there',
    })

    expect(res).toEqual({ id: 'msg-1', threadId: 'thr-1' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
    expect((init as any).headers.Authorization).toBe('Bearer ya29.token')
    const sentRaw = JSON.parse((init as any).body).raw as string
    // base64url: no +, /, or = padding
    expect(sentRaw).not.toMatch(/[+/=]/)
    const decoded = Buffer.from(sentRaw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    expect(decoded).toContain('To: joy@example.com')
    expect(decoded).toContain('Subject: Welcome')
    expect(decoded).toContain('Hello there')
  })

  it('throws a reconnect hint on 401/403', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'unauthorized' } as Response)
    await expect(
      sendGmail({ accessToken: 't', to: 'a@b.com', subject: 's', body: 'b' })
    ).rejects.toThrow(/reconnect your Google account/i)
  })

  it('requires an access token and a recipient', async () => {
    await expect(sendGmail({ accessToken: '', to: 'a@b.com', subject: 's', body: 'b' })).rejects.toThrow(/access token/i)
    await expect(sendGmail({ accessToken: 't', to: '', subject: 's', body: 'b' })).rejects.toThrow(/Recipient/i)
  })

  it('surfaces the API error body on other failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' } as Response)
    await expect(
      sendGmail({ accessToken: 't', to: 'a@b.com', subject: 's', body: 'b' })
    ).rejects.toThrow(/Gmail send failed \(500\)/)
  })
})
