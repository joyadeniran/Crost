// lib/google/gmail.ts
// Native Gmail send via the user's Google OAuth access token (gmail.send scope).
// No third-party tool broker — direct Gmail REST API. Server-side only.

function base64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function encodeHeader(value: string): string {
  // RFC 2047 encode non-ASCII headers (e.g. subjects with emoji/accents).
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

export interface GmailSendParams {
  accessToken: string
  to: string
  subject: string
  body: string
  cc?: string
  bcc?: string
  /** Set true if `body` is HTML */
  html?: boolean
}

export interface GmailSendResult {
  id: string
  threadId: string
}

/**
 * Sends an email as the authenticated user via the Gmail REST API.
 * Throws on non-2xx (caller surfaces the message to the founder).
 */
export async function sendGmail(params: GmailSendParams): Promise<GmailSendResult> {
  const { accessToken, to, subject, body, cc, bcc, html } = params
  if (!accessToken) throw new Error('No Google access token — reconnect your Google account in Settings.')
  if (!to) throw new Error('Recipient (to) is required.')

  const contentType = html ? 'text/html; charset="UTF-8"' : 'text/plain; charset="UTF-8"'
  const headers = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : '',
    bcc ? `Bcc: ${bcc}` : '',
    `Subject: ${encodeHeader(subject || '(no subject)')}`,
    'MIME-Version: 1.0',
    `Content-Type: ${contentType}`,
    'Content-Transfer-Encoding: 7bit',
  ].filter(Boolean).join('\r\n')

  const raw = base64Url(`${headers}\r\n\r\n${body ?? ''}`)

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 403) {
      throw new Error('Google authorization expired or insufficient Gmail permission — reconnect your Google account in Settings.')
    }
    throw new Error(`Gmail send failed (${res.status}): ${text.slice(0, 300)}`)
  }

  const data = await res.json()
  return { id: data.id, threadId: data.threadId }
}
