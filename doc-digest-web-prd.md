# doc-digest-web — Product Requirements Document

## Overview

doc-digest-web is a public SaaS web application that transforms uploaded PDF or Markdown documents into interactive, beautifully styled reading experiences with a persistent, crowd-visible AI chat interface. Users upload a document, get a formatted section-navigable page styled in the Magazine Feature aesthetic, and can chat with the document, fact-check claims, and edit section content. Chat histories are saved to the document and visible to all viewers. Public documents are editable by any authenticated user. All changes are versioned with point-in-time restore.

---

## Goals

**Must achieve:**
- Zero-friction document upload and processing with clear status feedback
- Persistent document library per user (documents survive page refresh and return visits)
- AI chat panel with persisted conversation history visible to all document viewers
- Section-level inline editing, open to any authenticated user on accessible documents
- Full version history with point-in-time restore
- Export to PDF
- Shareable documents: public (readable by anyone, editable by any authenticated user) or private (owner only)
- Works on free hosting tiers (Vercel + Render + Supabase) for initial launch

**Explicitly out of scope (v1):**
- Paid plans or billing
- Real-time co-editing / presence indicators
- Mobile-native app
- Bulk upload
- Custom styling / theme overrides (one fixed Magazine Feature style)
- Per-user permission management (invite-only sharing)

---

## User Stories

**Upload & Process**
> As a user, I want to drag-and-drop a PDF or Markdown file so it is processed and ready to read within a minute.

> As a user, I want to see a progress indicator while my document is being processed so I know the system is working.

> As a user, I want to be told clearly if my document exceeds limits so I understand why it was rejected.

**Document Viewer**
> As a user, I want to navigate between sections using a sticky sidebar table of contents so I can jump to relevant parts quickly.

**Editing & Versioning**
> As any authenticated user, I want to click on any section of a public document and edit it inline so I can contribute corrections or annotations.

> As a user, I want every save to create a versioned snapshot so I can always see what the document looked like before my changes.

> As a user, I want to open a version history panel and restore any previous version so I can undo unwanted edits.

**AI Chat**
> As a user, I want to open a chat panel and ask questions about the document so I can quickly understand its content.

> As a user, I want the full chat history for a document to persist and be visible to all viewers so everyone can see questions that have already been asked and answered.

> As a user, I want to highlight text and choose Ask / Fact-check / Summarize so I get immediate AI responses about specific passages.

> As a user, I want suggested follow-up questions per section so I know what to ask.

**Export**
> As a user, I want to export my document as a PDF so I can share or archive a static copy.

**Sharing**
> As a user, I want to generate a shareable public link so others can read and contribute to my document without signing in to view.

> As a user, I want to revoke a shared link so the document is no longer publicly accessible.

**Document Library**
> As a user, I want to see all my documents on a dashboard so I can return to any of them.

> As a user, I want to delete a document I no longer need so it doesn't count against my limit.

**Auth**
> As a new user, I want to sign up with my email address so my documents and contributions are attributed to my account.

> As a returning user, I want to log in and see my documents exactly as I left them.

---

## Functional Requirements

### 1. Authentication

1. The system shall provide email/password signup and login via Supabase Auth.
2. All document management routes shall require authentication; unauthenticated visitors are redirected to `/login`.
4. Exception: the public shared viewer (`/shared/:share_token`) shall be accessible without authentication for reading and chatting.
5. Email signup shall send a confirmation email; unconfirmed accounts cannot access the app.
6. The system shall support password reset via email link.

### 2. Document Upload

1. The upload page shall accept PDF (`.pdf`) and Markdown (`.md`, `.markdown`) files via drag-and-drop or file picker.
2. Files larger than **25 MB** shall be rejected before upload: "File exceeds the 25 MB limit."
3. PDFs with more than **100 pages** shall be rejected during extraction: "Document exceeds the 100-page limit."
4. If the user already has **20 documents**, the upload CTA shall be disabled with tooltip: "You've reached the 20-document limit. Delete a document to upload a new one." API attempts shall return HTTP 400 with the same message.
5. Files shall be uploaded directly from the browser to Supabase Storage using a short-lived signed upload URL.
6. Upon successful upload, the frontend shall POST to `POST /api/documents`, which creates a `documents` row with `status: "processing"` and triggers extraction on the FastAPI service.
7. The frontend shall poll `GET /api/documents/:id/status` every 3 seconds while `status === "processing"`.
8. On `status === "ready"`, the frontend auto-navigates to `/documents/:id`.
9. On `status === "failed"`, the frontend displays the `error_message` and a "Try again" button that deletes the failed record and returns to upload.

### 3. Document Processing (Backend)

1. The FastAPI service shall expose `POST /internal/extract`, authenticated by an `X-Internal-Secret` header.
2. The endpoint shall download the source file from Supabase Storage, run extraction, and write `document_data.json` to Supabase Storage at `<user_id>/<document_id>/document_data.json`.
3. Extraction shall use `pymupdf4llm` for PDFs and heading-based parsing for Markdown (ported from the existing `extract_document.py` logic).
4. On success, the service shall PATCH the `documents` row: `status = "ready"`, `page_count`, `section_count`, `word_count`. It shall also write the initial version record (version 1) to `document_versions`.
5. On failure, the service shall PATCH: `status = "failed"`, `error_message = <exception text>`.
6. Extraction shall time out after 120 seconds; timed-out documents shall be marked `failed`: "Processing timed out. Try a smaller document."

### 4. Document Viewer

1. The viewer shall be rendered at `/documents/:id` (authenticated owner and contributors) and `/shared/:share_token` (public, unauthenticated access permitted).
2. On load, the frontend fetches `document_data.json` from Supabase Storage via a signed read URL and renders sections client-side.
3. The viewer shall apply the **Magazine Feature** visual style exclusively:
   - Fonts: **Playfair Display** (headings) + **Source Sans 3** (body)
   - Palette: off-white background (`#faf9f6`), deep navy text (`#0f1f35`), coral accent (`#e05a3a`)
   - Layout: sticky left sidebar (ToC), main content column (max 720px), sliding right chat panel
4. The sidebar shall display a table of contents with one link per section. The active section shall be highlighted via IntersectionObserver.
5. Section reveal shall animate (opacity + translateY) on scroll entry, respecting `prefers-reduced-motion`.
6. Markdown content shall be rendered to HTML: bold, italic, inline code, fenced code blocks, ordered and unordered lists, blockquotes, and tables.

### 5. Inline Editing

1. On both the authenticated viewer and the public shared viewer, any **authenticated user** shall see an **Edit** button (pencil icon) on hover for each section.
2. Unauthenticated visitors on the public viewer shall not see Edit controls.
3. Clicking Edit switches that section to an editable state: rendered HTML is replaced by a `<textarea>` pre-populated with the section's raw Markdown.
4. The editing toolbar has two actions: **Save** and **Cancel**.
5. Clicking **Cancel** discards changes and returns to the rendered view. No version is created.
6. Clicking **Save** shall:
   a. POST to `POST /api/documents/:id/versions` with the full updated sections array and the `edited_section` id.
   b. Create a new version record in `document_versions`.
   c. Overwrite `document_data.json` in Supabase Storage with the new version's content.
   d. Return to the rendered view showing updated content.
7. Only one section may be in edit mode at a time. Clicking Edit on a second section while one is open shows a confirmation: "Discard unsaved changes?"
8. The editor shall attribute the save to the currently authenticated user (stored in the version record as `edited_by_user_id`).

### 6. Version History

1. `document_versions` stores every saved state of a document's sections array, including the user who made the change.
2. Version 1 is created automatically when extraction completes (the original extracted content; `edited_by_user_id = document owner`).
3. Each subsequent Save (§5.6) creates a new version with an auto-incrementing `version_number`.
4. A **Version History** button in the viewer header opens a drawer listing all versions in descending order showing: version number, timestamp, which section was edited, and the display name / email of who made the change.
5. Clicking any version previews it inline (read-only overlay) without navigating away.
6. The preview has a **Restore this version** button. Confirming shall:
   a. Create a new version record with the restored content (non-destructive; all prior versions are preserved). `restore_of` field set to the source `version_number`.
   b. Overwrite `document_data.json` in Supabase Storage.
   c. Close the drawer and re-render with the restored content.
7. Restore requires authentication. On the public shared viewer, the Restore button is visible but disabled with tooltip: "Sign in to restore versions."
8. Version history is visible (read-only) on the public shared viewer.

### 7. AI Chat Panel (Persistent History)

1. A floating chat bubble (bottom-right, coral background) toggles the chat panel.
2. The chat panel slides in from the right (~380px wide). On screens narrower than 1200px it overlays content; on wider screens it pushes the layout.
3. **On load**, the frontend shall fetch the existing chat history for the document from `GET /api/documents/:id/chat` and render all prior messages in the panel in chronological order. This applies to both the authenticated viewer and the public shared viewer.
4. Sending a message shall POST to `POST /api/chat` (Next.js route), which:
   a. Proxies to the FastAPI chat endpoint for streaming inference.
   b. After streaming completes, persists both the user message and the assistant response to the `chat_messages` table.
   Request body:
   ```json
   {
     "message": "string",
     "section_id": "string | null",
     "document_id": "string",
     "conversation_history": [{ "role": "user|assistant", "content": "string" }]
   }
   ```
5. The response streams via SSE; tokens are rendered incrementally.
6. The FastAPI chat endpoint shall call the Anthropic Claude API (`claude-sonnet-4-6`) with:
   - A system prompt describing the document (title, section list, full text truncated to 50 000 chars)
   - Three tools: `search_document`, `get_section`, `fact_check` (same logic as existing `tools.py`, adapted to use Anthropic tool-use format and request-body document data)
   - The last 10 messages of conversation history (passed in from the frontend, sourced from the persisted history)
7. Tool calls shall emit SSE events of type `tool_call` (`{ "type": "tool_call", "tool": "<name>" }`); the frontend shows "Searching document…" indicators.
8. Each chat message shall be attributed to the sender:
   - Authenticated users: attributed to their user id and display name.
   - Unauthenticated visitors: attributed as "Anonymous" with no user_id.
9. After each assistant message, the frontend automatically POSTs to `POST /api/followups` and renders up to 3 suggested follow-up question chips.
10. The chat panel shall show a loading indicator (spinner) if the FastAPI service is cold-starting and the first request takes longer than 5 seconds, with label: "AI is warming up…"

### 8. Text Selection Actions

1. Selecting 10 or more characters within a `.doc-section` shall show a floating popup: **Ask**, **Fact-check**, **Summarize**.
2. Clicking a button opens the chat panel (if closed), appends the message, and submits:
   - **Ask**: `"Explain this passage: \"<text>\""`
   - **Fact-check**: `"Fact check this claim: \"<text>\""`
   - **Summarize**: `"Summarize this in simpler terms: \"<text>\""`
3. The `section_id` of the containing section shall be passed as context.
4. The popup disappears on scroll, click outside, or after an action is triggered.
5. Text selection actions are available to all viewers (authenticated and unauthenticated).

### 9. Export to PDF

1. The viewer header shall include an **Export PDF** button.
2. Clicking it triggers the browser print dialog via a `@media print` stylesheet.
3. The print stylesheet shall:
   - Hide the sidebar, chat panel, chat toggle, selection popup, edit controls, version history button, and Export PDF button.
   - Set page margins to 1 inch.
   - Prevent section headings from breaking across pages (`break-after: avoid`).
   - Display the document title and page numbers in the footer.
4. No server-side PDF generation is required in v1.
5. Export is available on both the authenticated and public shared viewer.

### 10. Sharing

1. Each document has an `is_public` boolean (default `false`) and a `share_token` UUID (generated at creation).
2. The viewer header includes a **Share** button (authenticated users only; always visible, but the action updates the owner's document).
3. The Share modal contains:
   - A toggle: **Public link — On / Off**
   - When On: a read-only input with the full shareable URL (`https://<domain>/shared/<share_token>`) and a **Copy link** button.
   - When Off: the URL input is hidden.
4. Toggling Public link immediately PATCHes `POST /api/documents/:id/share` with `{ "is_public": true|false }`.
5. The public viewer at `/shared/:share_token` renders the document read-only for unauthenticated visitors (AI chat enabled, version history visible but restore disabled, no edit controls). Any authenticated user visiting the public link can edit (edit controls visible).
6. If `is_public = false` and a visitor navigates to `/shared/:share_token`, the response is a 404 page: "This document is not available."
7. Revoking a public link (toggling Off) does not invalidate `share_token`. A **Reset link** button in the Share modal regenerates `share_token`, invalidating the old URL.

### 11. Document Library

1. The dashboard at `/` lists all authenticated user's documents sorted by `updated_at` DESC.
2. Each card displays: title, source filename, page count, section count, current version number, sharing status badge (Public / Private), `created_at`.
3. Cards with `status: "processing"` show a spinner and auto-refresh every 5 seconds.
4. Cards with `status: "failed"` show an error state and a Delete button.
5. Each `status: "ready"` card links to `/documents/:id`.
6. Each card has a **⋮** menu: Open, Share, Export PDF, Delete.
7. Delete shows a confirmation dialog. Confirmed: removes the `documents` row, all `document_versions`, all `chat_messages`, and all Supabase Storage files.
8. The upload CTA is disabled when the user has 20 documents.

---

## Technical Notes

### Recommended Stack

| Layer | Technology | Hosting |
|-------|-----------|---------|
| Frontend | Next.js 14+ (App Router) | Vercel (free) |
| Backend API | FastAPI (Python 3.11+) | Render (free tier) |
| Auth | Supabase Auth (email/password) | Supabase (free) |
| Database | Supabase PostgreSQL | Supabase (free) |
| File Storage | Supabase Storage | Supabase (free, 1 GB) |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) | Pay-per-token |
| PDF Extraction | pymupdf4llm | Runs on Render |

**Why this stack:**
- Vercel + Next.js: gold-standard React SaaS with a generous free tier and global CDN
- Supabase: consolidates auth, database, and file storage into one free service with excellent TypeScript SDKs
- Render: free tier hosts a Python FastAPI service; cold-start loading indicator handles the ~30s warm-up UX
- Anthropic API: one API key replaces AWS Bedrock + Strands; no AWS infrastructure required

### Data Models

#### `documents` table

```sql
CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  source_type     TEXT NOT NULL CHECK (source_type IN ('pdf', 'markdown')),
  status          TEXT NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing', 'ready', 'failed')),
  is_public       BOOLEAN NOT NULL DEFAULT FALSE,
  share_token     UUID NOT NULL DEFAULT gen_random_uuid(),
  storage_path    TEXT,          -- Supabase Storage path to current document_data.json
  raw_file_path   TEXT NOT NULL, -- Supabase Storage path to original uploaded file
  page_count      INT,
  section_count   INT,
  word_count      INT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Owners can do anything with their documents
CREATE POLICY "Owners manage their documents"
  ON documents FOR ALL USING (auth.uid() = user_id);

-- Any authenticated user can read public documents (for editing access on shared viewer)
CREATE POLICY "Authenticated users read public documents"
  ON documents FOR SELECT
  USING (is_public = TRUE AND auth.role() = 'authenticated');
```

#### `document_versions` table

```sql
CREATE TABLE document_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number      INT NOT NULL,
  sections            JSONB NOT NULL,         -- full sections array snapshot
  edited_section      TEXT,                   -- section_id changed; NULL for initial/restore
  edited_by_user_id   UUID REFERENCES auth.users(id),
  restore_of          INT,                    -- version_number restored from; NULL if not a restore
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version_number)
);

ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;

-- Owner always has full access
CREATE POLICY "Owners manage versions"
  ON document_versions FOR ALL
  USING (document_id IN (SELECT id FROM documents WHERE user_id = auth.uid()));

-- Any authenticated user can read/insert versions for public documents
CREATE POLICY "Authenticated users manage versions of public documents"
  ON document_versions FOR ALL
  USING (document_id IN (SELECT id FROM documents WHERE is_public = TRUE))
  WITH CHECK (document_id IN (SELECT id FROM documents WHERE is_public = TRUE));
```

#### `chat_messages` table

```sql
CREATE TABLE chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  section_id      TEXT,                -- section context at time of message, nullable
  user_id         UUID REFERENCES auth.users(id),   -- NULL for unauthenticated senders
  display_name    TEXT,                -- snapshot of name at send time; "Anonymous" for unauthed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Owner can read/write all chat for their documents
CREATE POLICY "Owners manage chat"
  ON chat_messages FOR ALL
  USING (document_id IN (SELECT id FROM documents WHERE user_id = auth.uid()));

-- Anyone can read chat on public documents
CREATE POLICY "Anyone reads chat on public documents"
  ON chat_messages FOR SELECT
  USING (document_id IN (SELECT id FROM documents WHERE is_public = TRUE));

-- Any user (including anon via service role) can insert chat on public documents
-- (inserts are handled server-side via service role key to support unauthenticated senders)
```

#### `sections` JSONB schema (each element of `document_versions.sections`)

```json
{
  "id": "string",         // URL-safe slug, e.g. "1-introduction"
  "title": "string",
  "level": 2,             // heading depth: 2 = h2, 3 = h3
  "content": "string",    // raw Markdown
  "page_start": 1,        // PDF page number; null for Markdown
  "word_count": 350
}
```

#### Supabase Storage Layout

```
documents/                          (private bucket; access via signed URLs)
  <user_id>/
    <document_id>/
      source.<ext>                  original uploaded file
      document_data.json            current live version (overwritten on save/restore)
```

### API Contracts

#### Next.js API Routes

**`POST /api/documents`** — Create document + trigger extraction
```json
// Request
{ "filename": "paper.pdf", "storage_path": "uid/doc_id/source.pdf", "source_type": "pdf" }

// 201
{ "id": "uuid", "status": "processing" }

// 400
{ "error": "You've reached the 20-document limit." }
```

**`GET /api/documents/:id/status`**
```json
{ "status": "processing|ready|failed", "error_message": null }
```

**`DELETE /api/documents/:id`** — Auth required; owner only
```
204 (no body)
```

**`POST /api/documents/:id/versions`** — Auth required; any authenticated user for public docs, owner for private
```json
// Request
{ "sections": [ /* updated sections array */ ], "edited_section": "1-introduction" }

// 201
{ "version_number": 4, "created_at": "iso-timestamp" }
```

**`GET /api/documents/:id/versions`**
```json
[
  {
    "version_number": 3,
    "edited_section": "1-introduction",
    "edited_by": "user@example.com",
    "restore_of": null,
    "created_at": "..."
  }
]
```

**`GET /api/documents/:id/versions/:n`** — Fetch a version's full sections
```json
{ "version_number": 1, "sections": [ /* sections array */ ] }
```

**`POST /api/documents/:id/versions/:n/restore`** — Auth required
```json
// 201
{ "version_number": 5 }
```

**`POST /api/documents/:id/share`** — Auth required; owner only
```json
// Request
{ "is_public": true }

// 200
{ "is_public": true, "share_token": "uuid", "share_url": "https://..." }
```

**`POST /api/documents/:id/share/reset`** — Owner only
```json
// 200
{ "share_token": "new-uuid", "share_url": "https://..." }
```

**`GET /api/documents/:id/chat`** — Fetch persisted chat history (auth required for private, open for public via share_token)
```json
[
  { "id": "uuid", "role": "user", "content": "string", "display_name": "Alice", "section_id": null, "created_at": "..." },
  { "id": "uuid", "role": "assistant", "content": "string", "display_name": "AI", "section_id": null, "created_at": "..." }
]
```

**`POST /api/chat`** — Stream SSE + persist on completion
```json
// Request
{
  "message": "string",
  "section_id": "string | null",
  "document_id": "string",
  "conversation_history": [{ "role": "user|assistant", "content": "string" }]
}
// SSE events
// data: {"type": "text", "content": "token"}
// data: {"type": "tool_call", "tool": "search_document"}
// data: {"type": "done"}
```

**`POST /api/followups`**
```json
// Request
{ "document_id": "string", "section_id": "string" }

// 200
{ "questions": ["string", "string", "string"] }
```

**`GET /api/shared/:share_token`** — No auth required
```json
// 200
{
  "document": { "id", "title", "source_filename", "page_count", "section_count" },
  "sections": [ /* current sections from document_data.json */ ]
}

// 404 if is_public = false
{ "error": "This document is not available." }
```

#### FastAPI Internal Endpoints (require `X-Internal-Secret` header)

**`POST /internal/extract`**
```json
// Request
{
  "document_id": "string",
  "user_id": "string",
  "raw_file_path": "string",
  "source_type": "pdf | markdown",
  "supabase_url": "string",
  "supabase_service_key": "string"
}
// 202
{ "status": "accepted" }
```

**`POST /internal/chat`** — Called by Next.js proxy with document_data already resolved
```json
// Request
{
  "message": "string",
  "section_id": "string | null",
  "document_data": { /* full document_data.json object */ },
  "conversation_history": [{ "role": "string", "content": "string" }]
}
// SSE stream (same format as /api/chat)
```

**`POST /internal/followups`**
```json
// Request
{ "section_id": "string", "document_data": { /* full document_data.json */ } }

// 200
{ "questions": ["string", "string", "string"] }
```

### AI Integration

- Replace `strands-agents` + AWS Bedrock with the **Anthropic Python SDK** (`anthropic>=0.40.0`).
- Use `client.messages.stream()` for SSE-compatible streaming.
- Model: `claude-sonnet-4-6` (overridable via `CLAUDE_MODEL_ID` env var).
- Tool definitions (`search_document`, `get_section`, `fact_check`) mirror the existing `tools.py` logic, implemented using Anthropic's tool-use JSON Schema format.
- The Next.js proxy resolves `document_data.json` from Supabase Storage and passes it to FastAPI in the request body. FastAPI is fully stateless.

### Environment Variables

**Next.js (Vercel)**
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
INTERNAL_API_URL=
INTERNAL_API_SECRET=
NEXT_PUBLIC_APP_URL=             # e.g. https://doc-digest-web.vercel.app
```

**FastAPI (Render)**
```
ANTHROPIC_API_KEY=
CLAUDE_MODEL_ID=claude-sonnet-4-6
INTERNAL_API_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Edge Cases & Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| Non-PDF/MD file dropped | Rejected client-side before upload: "Only PDF and Markdown files are supported." |
| Password-protected PDF | Extraction fails; `error_message`: "This PDF is password-protected and cannot be processed." |
| Scanned PDF (image-only) | Extraction returns minimal content; viewer shows: "This document appears to be a scanned image. Text extraction may be incomplete." |
| Markdown with no headings | Synthetic ~500-word sections created; viewer renders normally |
| Render service cold-starting | Chat panel shows spinner with "AI is warming up…" on requests that exceed 5s; auto-retries |
| Anthropic API rate limit hit | Chat shows: "Rate limit reached. Please wait a moment before sending another message." |
| Storage signed URL expires mid-session | 403 caught; shows: "Session expired. Refresh the page to continue." |
| Two users edit same section simultaneously | Last write wins (no locking in v1); each save creates a new version, preserving all changes in history |
| Restore while a section is in edit mode | Confirmation dialog: "Discard unsaved edits and restore this version?" |
| Unauthenticated user tries to click Edit on shared doc | Edit button not shown; even if a forged request is sent, the API requires a valid session |
| Public viewer tries to restore a version | Restore button visible but disabled: "Sign in to restore versions." |
| Share token visited when `is_public = false` | 404 page: "This document is not available." |
| Document deleted with active shared link | 404 on any subsequent request to the shared URL |
| Network disconnect during SSE stream | `EventSource` error caught; shows: "Connection lost. Refresh to continue." |
| 21st upload attempted via API | Returns HTTP 400: "You've reached the 20-document limit." |
| Unauthenticated user sends a chat message | Persisted with `user_id = null` and `display_name = "Anonymous"` |

---

## Test Cases & Acceptance Criteria

### Auth
- [ ] **TC-01**: Sign up with email → confirmation sent → confirm → dashboard loads
- [ ] **TC-02**: Log in with existing email/password credentials → dashboard loads
- [ ] **TC-03**: Visit `/documents/:id` unauthenticated → redirected to `/login`
- [ ] **TC-04**: Visit `/shared/<valid-token>` unauthenticated → document renders read-only

### Upload & Processing
- [ ] **TC-05**: Upload valid 5-page PDF → "Processing" → "Ready" → auto-navigates to viewer
- [ ] **TC-06**: Upload 26 MB file → rejected before upload with size error
- [ ] **TC-07**: Upload 110-page PDF → document marked failed with page-count error
- [ ] **TC-08**: Upload Markdown → sections parsed → viewer renders
- [ ] **TC-09**: Dashboard with 20 documents → upload CTA disabled

### Viewer
- [ ] **TC-10**: Sections render with correct content; ToC shows all titles
- [ ] **TC-11**: Click ToC link → scrolls to section → entry becomes active
- [ ] **TC-12**: Magazine Feature style applied: Playfair Display headings, Source Sans 3 body, coral accent

### Editing & Versioning
- [ ] **TC-13**: Click Edit on a section → textarea opens → Save → content re-renders correctly
- [ ] **TC-14**: After saving, version number in header increments by 1; new version appears in history drawer with correct author
- [ ] **TC-15**: Open history drawer → version 1 listed → clicking previews original content
- [ ] **TC-16**: Restore v1 → new version created → content reverts → v1 and v2 still in history
- [ ] **TC-17**: Different authenticated user visits public shared link → sees Edit controls → saves edit → version records their email
- [ ] **TC-18**: Unauthenticated user visits public shared link → no Edit controls shown

### AI Chat & Persistence
- [ ] **TC-19**: Load a document that has prior chat messages → all prior messages visible on load
- [ ] **TC-20**: Send a message → streams correctly → after completion, reloading the page shows that message persisted
- [ ] **TC-21**: Unauthenticated visitor sends a message on shared doc → message stored as "Anonymous" → visible to all viewers
- [ ] **TC-22**: "Searching document…" indicator appears during tool calls
- [ ] **TC-23**: 3 follow-up chips appear after assistant response → clicking one sends it

### Text Selection
- [ ] **TC-24**: Select text → popup appears → "Fact-check" → chat opens with correct prefilled message
- [ ] **TC-25**: Click outside → popup disappears

### Export to PDF
- [ ] **TC-26**: Click "Export PDF" → browser print dialog → sidebar, chat, and controls hidden in preview → title and page numbers in footer

### Sharing
- [ ] **TC-27**: Toggle Public On → copy URL → open in incognito → document renders
- [ ] **TC-28**: Toggle Public Off → old URL returns 404
- [ ] **TC-29**: Reset link → old URL returns 404 → new URL works

### Document Library
- [ ] **TC-30**: Delete a document → confirmed → removed from list → shared URL returns 404

---

## Out of Scope (v1)

- Paid plans, billing, or usage metering beyond document count/size caps
- Per-user permission management (invite-only sharing, read-only collaborators)
- Real-time co-editing or presence indicators
- Document templates or pre-populated examples
- Mobile app (responsive web only)
- Bulk upload
- Custom style themes or CSS overrides (one fixed Magazine Feature style)
- Email notifications (processing complete, new comments, etc.)
- Admin dashboard or user management UI
- SSO / SAML / SCIM
