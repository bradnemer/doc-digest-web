export type DocumentStatus = "processing" | "ready" | "failed";
export type SourceType = "pdf" | "markdown";

export interface Document {
  id: string;
  user_id: string;
  title: string;
  source_filename: string;
  source_type: SourceType;
  status: DocumentStatus;
  is_public: boolean;
  share_token: string;
  storage_path: string | null;
  raw_file_path: string;
  page_count: number | null;
  section_count: number | null;
  word_count: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  sections: Section[];
  edited_section: string | null;
  edited_by_user_id: string | null;
  restore_of: number | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  document_id: string;
  role: "user" | "assistant";
  content: string;
  section_id: string | null;
  user_id: string | null;
  display_name: string | null;
  created_at: string;
}

export interface Section {
  id: string;
  title: string;
  level: number;
  content: string;
  page_start: number | null;
  word_count: number;
}

export interface DocumentData {
  metadata: {
    title: string;
    author: string | null;
    date: string | null;
    page_count: number | null;
    source_type: string;
    source_file: string;
  };
  sections: Section[];
  full_text: string;
}
