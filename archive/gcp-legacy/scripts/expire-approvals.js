#!/usr/bin/env node
// scripts/expire-approvals.js
// Called by Render cron job every hour. Marks pending approvals older than 24h as expired.

const url = process.env.CROST_APP_URL
const secret = process.env.CRON_SECRET

if (!url) {
  console.error('[expire-approvals] CROST_APP_URL is not set')
  process.exit(1)
}

fetch(`${url}/api/approvals/expire`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(secret && { 'x-cron-secret': secret }),
  },
})
  .then(r => r.json())
  .then(d => {
    console.log(`[expire-approvals] done — ${d.expired ?? 0} approvals expired`)
    process.exit(0)
  })
  .catch(e => {
    console.error('[expire-approvals] failed:', e.message)
    process.exit(1)
  })
