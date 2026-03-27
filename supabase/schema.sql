-- doc-digest-web database schema
-- Run this in the Supabase SQL editor to set up your project.

-- ── documents ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL DEFAULT 'Untitled',
  source_filename TEXT NOT NULL,
  source_type     TEXT NOT NULL CHECK (source_type IN ('pdf', 'markdown')),
  status          TEXT NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing', 'ready', 'failed')),
  is_public       BOOLEAN NOT NULL DEFAULT FALSE,
  share_token     UUID NOT NULL DEFAULT gen_random_uuid(),
  storage_path    TEXT,
  raw_file_path   TEXT NOT NULL,
  page_count      INT,
  section_count   INT,
  word_count      INT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their documents"
  ON documents FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Any authenticated user can read public documents
CREATE POLICY "Authenticated users read public documents"
  ON documents FOR SELECT
  USING (is_public = TRUE AND auth.role() = 'authenticated');

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_share_token ON documents(share_token);
CREATE INDEX idx_documents_status ON documents(status);


-- ── document_versions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number      INT NOT NULL,
  sections            JSONB NOT NULL,
  edited_section      TEXT,
  edited_by_user_id   UUID REFERENCES auth.users(id),
  restore_of          INT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version_number)
);

ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage versions"
  ON document_versions FOR ALL
  USING (
    document_id IN (SELECT id FROM documents WHERE user_id = auth.uid())
  )
  WITH CHECK (
    document_id IN (SELECT id FROM documents WHERE user_id = auth.uid())
  );

CREATE POLICY "Authenticated users manage versions of public documents"
  ON document_versions FOR ALL
  USING (
    document_id IN (SELECT id FROM documents WHERE is_public = TRUE)
      AND auth.role() = 'authenticated'
  )
  WITH CHECK (
    document_id IN (SELECT id FROM documents WHERE is_public = TRUE)
      AND auth.role() = 'authenticated'
  );

CREATE INDEX idx_versions_document_id ON document_versions(document_id);
CREATE INDEX idx_versions_document_version ON document_versions(document_id, version_number);


-- ── chat_messages ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  section_id      TEXT,
  user_id         UUID REFERENCES auth.users(id),
  display_name    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage chat"
  ON chat_messages FOR ALL
  USING (
    document_id IN (SELECT id FROM documents WHERE user_id = auth.uid())
  );

CREATE POLICY "Anyone reads chat on public documents"
  ON chat_messages FOR SELECT
  USING (
    document_id IN (SELECT id FROM documents WHERE is_public = TRUE)
  );

-- Inserts for public documents handled via service role key (supports anonymous senders)

CREATE INDEX idx_chat_document_id ON chat_messages(document_id);
CREATE INDEX idx_chat_created_at ON chat_messages(document_id, created_at);


-- ── Storage bucket ────────────────────────────────────────────────────────
-- Run these in the Supabase dashboard Storage section, or via the API:
--
-- 1. Create a private bucket named "documents"
-- 2. Enable RLS on the bucket
-- 3. Add storage policies:
--
-- Allow owners to upload:
--   (auth.uid()::text = (storage.foldername(name))[1])
--
-- Allow owners to read:
--   (auth.uid()::text = (storage.foldername(name))[1])
--
-- Allow service role full access (for the FastAPI backend):
--   (auth.role() = 'service_role')
