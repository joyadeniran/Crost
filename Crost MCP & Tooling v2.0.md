📄 Crost MCP & Tooling v2.0 (Real Integrations - MVP)

## Purpose
Upgrade the existing MCP Tools v1 (mock-based) into a **real, production-capable tool execution layer** that connects to external services (starting with Gmail).

This version is designed for:
- Fast MVP shipping (48–72 hours)
- Minimal infrastructure complexity
- Future extensibility (GitHub, Slack, etc.)

---

# 🧠 Core Principle

We are NOT building a full MCP ecosystem.

We are building:
> A reliable bridge between Crost agents and real-world APIs.

---

# 🏗️ System Overview

## Current (v1)
Worker → callTool() → mock data

## Target (v2)
Worker → callTool() → fetch connection → call real API → return real data

---

# 🧱 Architecture Components

## 1. Supabase: `connections` Table

Create a new table:

```sql
create table connections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id),
  service_name text not null,
  connection_id text, -- for Nango (preferred)
  access_token text, -- only if DIY OAuth
  refresh_token text,
  expires_at timestamp,
  created_at timestamp default now()
);
````

### Notes:

* Use `connection_id` if using Nango
* Do NOT store raw tokens if using Nango

---

## 2. OAuth Strategy (MANDATORY DECISION)

### ✅ Use Nango (Recommended)

Why:

* Handles OAuth flows
* Handles token refresh automatically
* Unified API across services

### Implementation:

* Create Nango account
* Add Gmail integration
* Get:

  * `NANGO_SECRET_KEY`
  * `NANGO_CONNECTION_ID`

Store `connection_id` in Supabase.

---

## 3. API Route: `/api/connect/gmail`

### Purpose:

Initiate OAuth flow

### Flow:

1. User clicks "Connect Gmail"
2. Redirect to Nango auth URL
3. After success → store `connection_id`

---

## 4. Upgrade `callTool()` (CRITICAL)

## BEFORE (v1)

```ts
export async function callTool(service, action, params) {
  return mockData;
}
```

## AFTER (v2)

```ts
export async function callTool(userId, service, action, params) {
  // 1. Fetch connection
  const connection = await getConnection(userId, service);

  if (!connection) {
    throw new Error("SERVICE_NOT_CONNECTED");
  }

  // 2. Route to handler
  switch (service) {
    case "gmail":
      return handleGmail(connection, action, params);

    default:
      throw new Error("UNKNOWN_SERVICE");
  }
}
```

---

## 5. Gmail Tool Implementation

## File: `/lib/tools/gmail.ts`

```ts
export async function handleGmail(connection, action, params) {
  switch (action) {
    case "search_emails":
      return searchEmails(connection, params);

    default:
      throw new Error("UNKNOWN_GMAIL_ACTION");
  }
}
```

---

## 6. Gmail Action: `search_emails`

```ts
async function searchEmails(connection, { query, limit = 5 }) {
  const response = await fetch(
    `https://api.nango.dev/v1/gmail/messages/search?q=${query}&limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.NANGO_SECRET_KEY}`,
        "Connection-Id": connection.connection_id,
      },
    }
  );

  const data = await response.json();

  return data.messages.map(msg => ({
    id: msg.id,
    subject: msg.subject,
    from: msg.from,
    snippet: msg.snippet,
  }));
}
```

---

# 🔁 Error Handling (MANDATORY)

## Case 1: Not Connected

```ts
throw new Error("SERVICE_NOT_CONNECTED");
```

## UI Behavior:

* Show banner:
  "Sales needs Gmail access → Connect now"

---

## Case 2: Expired Token

Handled automatically by Nango

---

## Case 3: API Failure

```ts
try {
  ...
} catch (err) {
  return {
    error: true,
    message: "Failed to fetch Gmail data"
  };
}
```

---

# 🧠 Worker Integration

Workers will call:

```ts
await callTool(userId, "gmail", "search_emails", {
  query: "supplier invoice",
  limit: 5
});
```

---

# 🖥️ UI Requirements

## Settings Page → Integrations Section

### Show:

* Gmail: Connected / Not Connected
* Button: Connect / Reconnect

---

## Activity Feed Behavior

If tool fails with `SERVICE_NOT_CONNECTED`:

Display:

> "⚠️ Sales needs access to Gmail to continue"

---

# 🚫 Out of Scope (DO NOT BUILD)

* GitHub integration
* Slack integration
* Full MCP server architecture
* Background token refresh jobs
* Complex permission systems

---

# 🧪 Testing Plan

## Step 1:

Connect Gmail

## Step 2:

Trigger Worker Task:
"Find recent supplier emails"

## Step 3:

Verify:

* Real emails returned
* Displayed in Activity Feed
* Saved as memo

---

# 🎯 Definition of Done

✅ User connects Gmail
✅ Connection stored in Supabase
✅ `callTool()` fetches connection
✅ Gmail API returns real data
✅ Worker uses real data
✅ Activity Feed shows real output

---

# 🔮 Future Extensions (NOT NOW)

* Add GitHub via same pattern
* Add Slack
* Replace Nango with in-house OAuth (optional)
* Add tool permission gating per department

---

# 🧠 Final Mental Model

You are building:

> "Agents that can read and act on real-world data"

NOT:

> "A perfect MCP framework"

---

# ⚡ Build Priority

1. `connections` table
2. Gmail OAuth (via Nango)
3. Upgrade `callTool()`
4. Implement `search_emails`
5. UI connection state
6. Test end-to-end

---

**Ship this before adding anything else.**

```

---

# 🚀 My Take (Strategically)

This is one of those moments that determines if Crost becomes:

- ❌ another “AI demo”
- ✅ a **real operating system**

Because the moment Gmail works:

> **Crost becomes aware of the founder’s real world**

That’s a *huge* leap.

---

If you want next step after this, I can help you design:

👉 **“First magical demo”** (the thing that makes investors go “oh shit”)
```
