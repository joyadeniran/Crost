# CROST — End-to-End MVP Test Manual

This manual guides you through a full "Founder Journey" to verify that the application is ready for MVP deployment.

---

## Phase 1: The First Impression (Signup & Security)

### **1.1 Pre-filled Signup**
- **Action:** Open your browser to `/signup?email=test@example.com`.
- **Verify:** The email field is automatically filled with `test@example.com`.

### **1.2 Duplicate Account Redirect (Gap H3)**
- **Action:** Try to sign up with an email that already has an account.
- **Verify:** You are immediately redirected to `/login?email=...` with a toast message saying an account already exists. No redundant OTP is sent.

### **1.3 Auth Middleware Hardening (Gap H2)**
- **Action:** Sign up with a new email/password. When it asks for the OTP, **DO NOT enter it**. Instead, try to manually type `/dashboard` or `/onboarding/identity` in the URL bar.
- **Verify:** You are hard-blocked and redirected to `/verify-email`. You cannot see the dashboard until the email is confirmed.

---

## Phase 2: Onboarding & Identity

### **2.1 The 3-Step Flow**
- **Action:** Complete the Identity flow (Name, Business Description, Stage).
- **Verify:**
    - [ ] Questions appear one by one.
    - [ ] Orc provides a "Reflection" (summary) of your business category after Step 2.
    - [ ] "Meet your Chief of Staff" screen appears before department selection.

### **2.2 Team Activation**
- **Action:** Select 2-3 departments (e.g., Marketing, Sales).
- **Verify:** The "Continue" button is disabled until at least 2 are selected.

### **2.3 First Mission Prompt**
- **Action:** On the final step, select one of the suggested "First Missions" (e.g., "Create a Pitch Deck").
- **Verify:** You are redirected to the War Room, and Orc immediately begins a **Planning Session** with a warm office-themed message (e.g., "Preparing your mission...").

---

## Phase 3: The War Room (Core Intelligence)

### **3.1 Planning & Waterfall**
- **Action:** Let the first mission plan generate.
- **Verify:** 
    - [ ] A Plan Card appears with a list of tasks.
    - [ ] Every task has a "Reasoning" and "Expected Deliverable."
    - [ ] A one-sentence "Risk Assessment" is visible.

### **3.2 Tool Execution & Normalization (v11.41)**
- **Action:** Use a slash command to test direct tool calling. Type `/gmail.search_emails test`.
- **Verify:** 
    - [ ] If not connected, it shows a "No connection" warning.
    - [ ] If connected, it generates an **Approval Card** with the action `GMAIL_SEARCH_EMAILS` (normalized uppercase).
- **Action:** Approve the action.
- **Verify:** The tool executes and returns a result. The department status returns to **"Idle"**.

### **3.3 Assistant Mode (Assistant Mode v11.38)**
- **Action:** Ask a simple question: `Who are you and what can you do?`
- **Verify:** Orc responds **directly** in the chat thread without creating a multi-task plan.

---

## Phase 4: Artefacts & Lineage

### **4.1 Artefact Generation (Gap H1)**
- **Action:** Complete a task that produces a document (e.g., @marketing "Write a blog post about our launch").
- **Verify:**
    - [ ] The task finishes and produces a card in the **Artefacts** tab.
    - [ ] The card shows a **Visual Preview** (even for PDF/DOCX) using the new iframe-scaling tech.
    - [ ] The "Metadata" tab in the artefact drawer shows the parent **Goal** and **Task ID**.

### **4.2 Citations Section**
- **Action:** Open the artefact drawer and look at the bottom.
- **Verify:** It lists "Sources" including Memos, KB files, or Tool calls used to create it. Tool calls should show a clean list, not raw JSON.

---

## Phase 5: Knowledge Base & Memory

### **5.1 KB Upload & Extraction**
- **Action:** Go to **Knowledge Base** and upload a PDF or DOCX.
- **Verify:** The file appears in the list and shows "Extracted" status after a few seconds.

### **5.2 Source of Truth (Spec §8 / v11.34)**
- **Action:** Go to **War Room** and ask: `@orc What is our current business stage?`
- **Verify:** Orc correctly identifies your stage from the **Strategic Context** (fetched from the singular `company_memo` table).

---

## Phase 6: System Stability

### **6.1 Quota & Reset (v11.33)**
- **Verify:** The API Keys page shows a **Usage Bar**.
- **Edge Case:** If you hit the limit, wait until midnight UTC or manually reset the date in your DB.
- **Verify:** The "Limit Reached" banner in the War Room disappears automatically after reset.

---

### **Success Criteria for Deployment**
If all the above steps pass without raw JSON "leaks" or "stuck" departments, the build is **MVP-READY**.
