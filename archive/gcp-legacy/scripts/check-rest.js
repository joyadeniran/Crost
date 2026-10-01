const url = 'https://vgktzhlfpaetgiqjpnbu.supabase.co/rest/v1/event_log?select=description&order=created_at.desc&limit=20'
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZna3R6aGxmcGFldGdpcWpwbmJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyOTI1NjIsImV4cCI6MjA5MDg2ODU2Mn0.lkc_YmmxPYSPPXNwssDpf5ZD-8VwstsWnn2h_hbRQ-I'

fetch(url, { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }})
  .then(res => res.json())
  .then(data => console.log('EVENT LOGS:', data))
  .catch(err => console.error(err))

const memosUrl = 'https://vgktzhlfpaetgiqjpnbu.supabase.co/rest/v1/company_memos?select=title,body&order=created_at.desc&limit=5'
fetch(memosUrl, { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }})
  .then(res => res.json())
  .then(data => console.log('MEMOS:', data))
  .catch(err => console.error(err))
