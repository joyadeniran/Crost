# Artifact Format Transformation Plan

## Problem Statement

**Current State**: All artifact outputs are stored as JSON files, regardless of content type.
- Email templates stored as `.json` files containing JSON structure
- Outreach plans stored as `.json` with nested JSON structure
- Research outputs stored as `.json` files

**User Expectation**: Artifacts should be human-readable downloadable files matching their content type.
- Email templates → `.txt` or `.docx` files (human-readable)
- Outreach plans → `.md` or `.docx` files (human-readable)
- Research findings → `.md` or `.txt` files (human-readable)
- Spreadsheet data → `.xlsx` files (tabular format)

**CROST_SPEC Requirement** (Section 6):
- Artifact types: "doc" | "excel" | "image"
- MVP Supported: Documents, Excel/CSV, Images
- Rule: "Downloadable content → Artefact"
- Rule: "Long outputs → Artefact"

---

## Root Cause Analysis

### Current Flow
```
Department/Worker Output
    ↓
Detected as JSON (tryParseJSON)
    ↓
Stored as .json file in Storage
    ↓
User sees: {"task_id": "...", "action": "...", ...}
    ↓
❌ Not human-readable, not downloadable as intended format
```

### Issue: Lost Context
The system doesn't distinguish between:
1. **Structured data that should remain JSON** (e.g., task metadata, status reports)
2. **Content that should be extracted and formatted** (e.g., email body → .txt, template → .docx)
3. **Tabular data that should be Excel** (e.g., partner research → .xlsx)

---

## Proposed Solution Architecture

### Phase 1: Content Type Detection & Routing
**New detection layer in worker/execute endpoint:**

```
JSON Output Structure Analysis:
├─ Has specific field indicating content type?
│  ├─ refined_email_template → Extract to .txt or .docx
│  ├─ email_template → Extract to .txt or .docx
│  ├─ coordinated_outreach_plan → Convert to .md
│  ├─ research_data (array of objects) → Convert to .xlsx
│  ├─ research_findings → Extract to .md
│  └─ ... (pattern matching)
│
├─ Content semantic analysis
│  ├─ Contains email headers/body → Email format (.txt/.docx)
│  ├─ Contains markdown formatting → Markdown (.md)
│  ├─ Contains table-like structure → Spreadsheet (.xlsx)
│  └─ Contains prose → Document (.docx/.md)
│
└─ Fallback: Keep as .json if unclear
```

### Phase 2: File Format Transformation
**For each identified content type:**

**Email Templates** (.txt or .docx):
```
Input: {
  "subject": "...",
  "body": "..."
}

Output: 
- .txt: Simple text file with subject + body
- .docx: Formatted document with subject as heading, body formatted

Tool: docx skill for .docx generation
```

**Outreach Plans** (.md):
```
Input: {
  "sales": { "task_id": "...", "label": "...", "status": "..." },
  "marketing": { ... },
  ...
}

Output: Markdown with:
- Department sections (H2 headings)
- Task list with status badges
- Links to individual task artifacts

Tool: Direct markdown generation
```

**Research Data** (.xlsx):
```
Input: Array of objects or structured data

Output: Excel workbook with:
- Headers from object keys
- Data rows from array items
- Auto-sized columns
- Table formatting

Tool: xlsx skill for Excel generation
```

**Research Findings** (.md):
```
Input: {
  "findings": "narrative text",
  "key_insights": ["point1", "point2"],
  ...
}

Output: Markdown formatted document

Tool: Direct markdown generation
```

---

## Implementation Strategy

### Step 1: Create Output Type Router
**New utility function**: `detectAndTransformOutput()`

```typescript
interface OutputDetection {
  sourceFormat: 'json' | 'text' | 'array'
  contentType: 'email' | 'document' | 'plan' | 'research' | 'generic'
  targetFormat: 'txt' | 'docx' | 'md' | 'xlsx' | 'json'
  extractionPath?: string  // e.g., 'refined_email_template.body'
  transformer: (data: any) => Promise<string | Buffer>
}

function detectOutputType(jsonOutput: object): OutputDetection {
  // Pattern matching on known fields
  if ('refined_email_template' in jsonOutput || 'email_template' in jsonOutput) {
    return { contentType: 'email', targetFormat: 'txt', ... }
  }
  if ('coordinated_outreach_plan' in jsonOutput) {
    return { contentType: 'plan', targetFormat: 'md', ... }
  }
  if (Array.isArray(jsonOutput) || 'data' in jsonOutput) {
    return { contentType: 'research', targetFormat: 'xlsx', ... }
  }
  // ... more patterns
}
```

### Step 2: Create Format Transformers
**Location**: `lib/artifact-transformers/`

```
lib/artifact-transformers/
├── email-transformer.ts      (→ .txt or use docx skill)
├── markdown-transformer.ts   (→ .md)
├── excel-transformer.ts      (→ .xlsx, delegates to xlsx skill)
├── document-transformer.ts   (→ .docx, delegates to docx skill)
└── index.ts                  (export all)
```

### Step 3: Integrate into Worker Endpoint
**Modify**: `app/api/worker/execute/route.ts`

```typescript
// After LLM executes and returns JSON output:
const output = result  // JSON object from LLM

// NEW: Detect output type
const detection = detectOutputType(output)

// NEW: Transform to proper format
if (detection.targetFormat !== 'json') {
  const fileContent = await detection.transformer(output)
  const extension = detection.targetFormat
  
  // Upload transformed file
  const artifact = await uploadTransformedArtifact(
    fileContent,
    detection.contentType,
    extension
  )
} else {
  // Store as JSON if no transformation needed
  const artifact = await uploadArtifactFile(...)
}
```

### Step 4: Skill Integration
**Use existing skills for generation:**

- **docx skill**: For email templates → .docx format
- **xlsx skill**: For research data → Excel spreadsheets
- **Direct generation**: For markdown and text files

---

## Content Type Mapping

### Known Department Outputs

**Sales Department**:
- `draft_email_template` → Email format (.txt)
- `review_and_refine_email_template` → Email format (.txt)
- Output: `.txt` file with subject + body

**Marketing Department**:
- `draft_campaign_email` → Email format (.txt)
- `create_email_template` → Email format (.txt/.docx)
- Output: `.txt` or `.docx` with formatted email

**Operations Department**:
- `coordinate_outreach_efforts` → Plan format (.md)
- `create_project_plan` → Plan format (.md/.docx)
- Output: `.md` with structured plan

**Engineering Department**:
- `research_potential_partners` → Research format (.md/.xlsx)
- `analyze_codebase` → Report format (.md)
- Output: `.md` or `.xlsx` depending on data structure

---

## Technical Constraints & Solutions

### Constraint 1: Format Detection Ambiguity
**Problem**: How to distinguish between:
- JSON that should stay JSON (metadata, structured task info)
- JSON that should be transformed (email content)

**Solution**: 
- Look for domain-specific keys: `refined_email_template`, `coordinated_outreach_plan`
- Semantic analysis: Does it contain "subject" + "body"? → Email
- Presence of prose text vs structured metadata

### Constraint 2: Skill Dependencies
**Problem**: 
- `docx` skill might add overhead
- `xlsx` skill needs tabular data

**Solution**:
- Use skills only when necessary
- For simple formats (.txt, .md), generate directly
- For complex formats (.docx, .xlsx), use skills
- Fallback to JSON if transformation fails

### Constraint 3: Model Capability
**Problem**: 
- Can the model that creates outputs also annotate their type?

**Solution**:
- Pattern matching (most reliable)
- Let destination system detect based on content
- Add metadata field in JSON: `output_format: 'email' | 'plan' | 'research'`
- Model can be guided to include this in future

### Constraint 4: Circular Dependencies
**Problem**: 
- Worker endpoint calls transformers
- Transformers might use skills
- Skills run in same worker context

**Solution**:
- Keep transformers synchronous where possible
- Use async/await for skill calls
- Implement graceful fallback (if transformation fails, store as JSON)

---

## Dependency Analysis

### Required Components

1. **Output Type Detection** (no external deps)
   - Pattern matching on known fields
   - Simple heuristics

2. **Text Transformers** (no external deps)
   - Email → .txt
   - Plan → .md
   - Direct string generation

3. **docx Skill Integration** (for email/document templates)
   - If available, use it
   - Fallback to .txt if not available

4. **xlsx Skill Integration** (for research/tabular data)
   - If available, use it
   - Fallback to .csv if not available

5. **Storage Upload** (already exists)
   - Use existing `uploadArtifactFile()` logic
   - Just change file extension

---

## Implementation Order

### Priority 1: MVP (Week 1)
1. Create output type detector
2. Implement text-based transformers (email → .txt, plan → .md)
3. Integrate into worker endpoint
4. Test with email and plan outputs

### Priority 2: Enhanced Formats (Week 2)
1. Integrate docx skill for email templates
2. Integrate xlsx skill for research data
3. Add metadata field to artifact table
4. Update UI to show proper file icons

### Priority 3: Polish (Week 3)
1. Improve detection heuristics
2. Add transformation error handling
3. Create transformation test suite
4. Document new output format patterns

---

## Validation & Testing

### Test Case 1: Email Template
**Input**:
```json
{
  "refined_email_template": {
    "subject": "Unlock Seamless Checkout Experiences",
    "body": "Dear [Recipient],\n\nWe've been..."
  }
}
```

**Expected Output**:
- File type: `.txt` or `.docx`
- Content: Plain text with Subject: + body
- Human readable: ✅
- Downloadable: ✅

### Test Case 2: Outreach Plan
**Input**:
```json
{
  "coordinated_outreach_plan": {
    "sales": { "task_id": "...", "label": "..." },
    "marketing": { "task_id": "...", "label": "..." }
  }
}
```

**Expected Output**:
- File type: `.md`
- Content: Markdown with departments as sections
- Human readable: ✅
- Downloadable: ✅

### Test Case 3: Research Data
**Input**:
```json
[
  { "company": "Acme Corp", "industry": "Tech", "status": "interested" },
  { "company": "Beta Inc", "industry": "Finance", "status": "contacted" }
]
```

**Expected Output**:
- File type: `.xlsx`
- Content: Excel spreadsheet with columns (company, industry, status)
- Human readable: ✅
- Downloadable: ✅

---

## Approach Summary

| Phase | What | How | Tools | Time |
|-------|------|-----|-------|------|
| **Detection** | Identify output type | Pattern matching + heuristics | TypeScript | 2 hrs |
| **Transform Text** | Email/Plan to text | String formatting | None | 2 hrs |
| **Transform Docs** | Email templates to .docx | Delegate to docx skill | docx skill | 1 hr |
| **Transform Data** | Research to .xlsx | Delegate to xlsx skill | xlsx skill | 1 hr |
| **Integration** | Add to worker endpoint | Modify upload logic | Existing code | 2 hrs |
| **Testing** | Validate all formats | Create test cases | Manual testing | 2 hrs |

**Total Effort**: ~10 hours  
**Dependencies**: docx skill, xlsx skill (already available)  
**Risk**: Low (fallback to JSON if transformation fails)  
**Impact**: High (massive UX improvement)

---

## Recommendation

✅ **This is feasible and valuable.**

The approach is:
1. **Backward compatible** - Old JSON artifacts still work
2. **Graceful degradation** - Failures fall back to JSON
3. **Skill-leveraging** - Uses existing docx/xlsx skills
4. **Phased** - Can implement MVP quickly, add fancy formats later
5. **User-focused** - Solves the exact problem you described

**Proceed with implementation?**

Options:
- **A**: Full implementation (all formats in one go)
- **B**: MVP first (text formats only, text-based transformers), then add docx/xlsx later
- **C**: Manual for now (identify output types, keep as readable text until automation)

I recommend **Option B**: Get MVP working fast (2-3 hours), then add fancy formats later.

