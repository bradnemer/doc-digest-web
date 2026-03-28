import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const INTERNAL_SECRET = Deno.env.get("INTERNAL_API_SECRET") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL_ID") ?? "claude-sonnet-4-6";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Internal-Secret",
};

interface ExtractRequest {
  document_id: string;
  user_id: string;
  raw_file_path: string;
  source_type: "pdf" | "markdown";
}

interface Section {
  id: string;
  title: string;
  level: number;
  content: string;
  page_start: number | null;
  word_count: number;
}

interface DocumentData {
  metadata: {
    title: string;
    page_count: number | null;
    source_type: string;
    source_file: string;
  };
  sections: Section[];
  full_text: string;
}

// ── Slug helper ────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function uniqueId(base: string, seen: Set<string>): string {
  let id = slugify(base) || "section";
  if (!seen.has(id)) { seen.add(id); return id; }
  let n = 2;
  while (seen.has(`${id}-${n}`)) n++;
  seen.add(`${id}-${n}`);
  return `${id}-${n}`;
}

// ── Markdown extraction (no AI needed) ────────────────────────────────────

function extractMarkdown(text: string, filename: string): DocumentData {
  const lines = text.split("\n");
  const sections: Section[] = [];
  const seen = new Set<string>();

  let currentTitle = "";
  let currentLevel = 2;
  let currentLines: string[] = [];
  let docTitle = filename.replace(/\.[^.]+$/, "");

  function flush() {
    if (!currentTitle && currentLines.every(l => l.trim() === "")) return;
    const content = currentLines.join("\n").trim();
    if (!content && !currentTitle) return;
    const title = currentTitle || "Introduction";
    sections.push({
      id: uniqueId(title, seen),
      title,
      level: currentLevel,
      content,
      page_start: null,
      word_count: content.split(/\s+/).filter(Boolean).length,
    });
  }

  for (const line of lines) {
    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);

    if (h1) {
      docTitle = h1[1].trim();
      continue;
    }
    if (h2) {
      flush();
      currentTitle = h2[1].trim();
      currentLevel = 2;
      currentLines = [];
      continue;
    }
    if (h3) {
      flush();
      currentTitle = h3[1].trim();
      currentLevel = 3;
      currentLines = [];
      continue;
    }
    currentLines.push(line);
  }
  flush();

  // If no headings found, split into ~500-word chunks
  if (sections.length === 0) {
    const words = text.split(/\s+/).filter(Boolean);
    const CHUNK = 500;
    for (let i = 0; i < words.length; i += CHUNK) {
      const chunk = words.slice(i, i + CHUNK).join(" ");
      const n = Math.floor(i / CHUNK) + 1;
      sections.push({
        id: `section-${n}`,
        title: `Section ${n}`,
        level: 2,
        content: chunk,
        page_start: null,
        word_count: Math.min(CHUNK, words.length - i),
      });
    }
  }

  const fullText = sections.map(s => s.content).join("\n\n");
  return {
    metadata: { title: docTitle, page_count: null, source_type: "markdown", source_file: filename },
    sections,
    full_text: fullText,
  };
}

// ── PDF extraction via Anthropic PDF API ──────────────────────────────────

async function extractPdf(pdfBytes: Uint8Array, filename: string): Promise<DocumentData> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const base64 = btoa(String.fromCharCode(...pdfBytes));

  const prompt = `Extract this document into structured sections and return ONLY valid JSON with no surrounding text or markdown fences.

The JSON must match this exact schema:
{
  "metadata": {
    "title": "<document title>",
    "page_count": <number>,
    "source_type": "pdf"
  },
  "sections": [
    {
      "id": "<unique-url-slug>",
      "title": "<section title>",
      "level": <2 or 3>,
      "content": "<full section text>",
      "page_start": <page number or null>,
      "word_count": <number>
    }
  ],
  "full_text": "<all section content concatenated>"
}

Rules:
- level 2 for major/top-level sections, level 3 for subsections
- If no clear headings, create sections of approximately 500 words each
- IDs must be unique URL-safe slugs derived from the title (lowercase, hyphens, no special chars)
- Include ALL document text in sections — do not omit content
- word_count is the number of words in that section's content
- full_text is all sections' content joined by double newlines`;

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          } as Parameters<typeof client.messages.create>[0]["messages"][0]["content"][0],
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text.trim() : "";

  // Strip any markdown fences if Claude added them
  const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  const data = JSON.parse(jsonStr) as DocumentData;
  data.metadata.source_file = filename;

  // Ensure IDs are unique
  const seen = new Set<string>();
  for (const s of data.sections) {
    s.id = uniqueId(s.id || s.title, seen);
  }

  return data;
}

// ── Patch document status ─────────────────────────────────────────────────

async function patchFailed(sb: ReturnType<typeof createClient>, documentId: string, message: string) {
  await sb.from("documents").update({ status: "failed", error_message: message }).eq("id", documentId);
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // Validate internal secret
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body: ExtractRequest = await req.json();
  const { document_id, user_id, raw_file_path, source_type } = body;

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Run synchronously — Next.js fires this request without awaiting the response,
  // so the Edge Function can take as long as needed (up to 150s).
  await runExtraction(sb, document_id, user_id, raw_file_path, source_type);

  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});

async function runExtraction(
  sb: ReturnType<typeof createClient>,
  documentId: string,
  userId: string,
  rawFilePath: string,
  sourceType: string
) {
  try {
    // Download source file
    const { data: fileData, error: downloadErr } = await sb.storage
      .from("documents")
      .download(rawFilePath);

    if (downloadErr || !fileData) {
      await patchFailed(sb, documentId, `Failed to download file: ${downloadErr?.message}`);
      return;
    }

    const fileBytes = new Uint8Array(await fileData.arrayBuffer());
    const filename = rawFilePath.split("/").pop() ?? "document";

    let docData: DocumentData;

    if (sourceType === "pdf") {
      // Enforce rough size limit (~25MB already validated client-side, but double-check)
      if (fileBytes.length > 26 * 1024 * 1024) {
        await patchFailed(sb, documentId, "File exceeds the 25 MB limit.");
        return;
      }
      docData = await extractPdf(fileBytes, filename);
    } else {
      const text = new TextDecoder().decode(fileBytes);
      docData = extractMarkdown(text, filename);
    }

    // Validate page count
    if (sourceType === "pdf" && docData.metadata.page_count && docData.metadata.page_count > 100) {
      await patchFailed(sb, documentId, "Document exceeds the 100-page limit.");
      return;
    }

    const sections = docData.sections;
    const sectionCount = sections.length;
    const wordCount = sections.reduce((sum, s) => sum + (s.word_count ?? 0), 0);
    const title = docData.metadata.title.replace(/\*+/g, "").trim() || filename.replace(/\.[^.]+$/, "");
    const storagePath = `${userId}/${documentId}/document_data.json`;

    // Upload document_data.json
    const jsonBytes = new TextEncoder().encode(JSON.stringify(docData));
    const { error: uploadErr } = await sb.storage
      .from("documents")
      .upload(storagePath, jsonBytes, {
        contentType: "application/json",
        upsert: true,
      });

    if (uploadErr) {
      await patchFailed(sb, documentId, `Failed to store document data: ${uploadErr.message}`);
      return;
    }

    // Create initial version record
    await sb.from("document_versions").insert({
      document_id: documentId,
      version_number: 1,
      sections,
      edited_section: null,
      edited_by_user_id: userId,
      restore_of: null,
    });

    // Mark document ready
    await sb.from("documents").update({
      status: "ready",
      storage_path: storagePath,
      page_count: docData.metadata.page_count ?? null,
      section_count: sectionCount,
      word_count: wordCount,
      title,
    }).eq("id", documentId);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await patchFailed(sb, documentId, message);
  }
}
