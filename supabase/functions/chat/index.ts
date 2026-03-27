import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";

const INTERNAL_SECRET = Deno.env.get("INTERNAL_API_SECRET") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL_ID") ?? "claude-sonnet-4-6";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Internal-Secret",
};

// ── Tool definitions ───────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_document",
    description: "Search the document for text matching a query. Returns the top 5 matching excerpts with surrounding context.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "The search query" } },
      required: ["query"],
    },
  },
  {
    name: "get_section",
    description: "Retrieve the full content of a specific section by its ID.",
    input_schema: {
      type: "object",
      properties: { section_id: { type: "string", description: "The section slug ID" } },
      required: ["section_id"],
    },
  },
  {
    name: "fact_check",
    description: "Check a claim against the document content and determine if it is supported, contradicted, or not addressed.",
    input_schema: {
      type: "object",
      properties: {
        claim: { type: "string", description: "The claim to fact-check" },
        section_id: { type: "string", description: "Optional section ID to focus the check" },
      },
      required: ["claim"],
    },
  },
];

// ── Tool execution ─────────────────────────────────────────────────────────

interface DocData {
  metadata?: { title?: string };
  sections?: Array<{ id: string; title: string; content: string }>;
  full_text?: string;
}

function searchDocument(query: string, docData: DocData): string {
  const queryLower = query.toLowerCase();
  const results: string[] = [];
  for (const section of docData.sections ?? []) {
    const content = section.content ?? "";
    let idx = content.toLowerCase().indexOf(queryLower);
    while (idx !== -1 && results.length < 5) {
      const start = Math.max(0, idx - 200);
      const end = Math.min(content.length, idx + query.length + 200);
      results.push(`[${section.title}] ...${content.slice(start, end)}...`);
      idx = content.toLowerCase().indexOf(queryLower, idx + 1);
    }
    if (results.length >= 5) break;
  }
  return results.length ? results.join("\n\n---\n\n") : "No matches found for that query.";
}

function getSection(sectionId: string, docData: DocData): string {
  const section = docData.sections?.find(s => s.id === sectionId);
  return section ? `# ${section.title}\n\n${section.content}` : `Section '${sectionId}' not found.`;
}

function factCheck(claim: string, sectionId: string | undefined, docData: DocData): string {
  const sections = sectionId
    ? (docData.sections ?? []).filter(s => s.id === sectionId)
    : (docData.sections ?? []);
  const context = sections.map(s => `## ${s.title}\n${s.content}`).join("\n\n").slice(0, 15000);
  return `Document context for fact-checking:\n\n${context}`;
}

function executeTool(name: string, inputs: Record<string, string>, docData: DocData): string {
  if (name === "search_document") return searchDocument(inputs.query, docData);
  if (name === "get_section") return getSection(inputs.section_id, docData);
  if (name === "fact_check") return factCheck(inputs.claim, inputs.section_id, docData);
  return `Unknown tool: ${name}`;
}

// ── System prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(docData: DocData, sectionId?: string | null): string {
  const title = docData.metadata?.title ?? "Untitled";
  const toc = (docData.sections ?? []).map(s => `- ${s.title} (id: ${s.id})`).join("\n");
  const fullText = (docData.full_text ?? "").slice(0, 50000);

  let focused = "";
  if (sectionId) {
    const s = docData.sections?.find(sec => sec.id === sectionId);
    if (s) focused = `\n\nThe user is currently reading: **${s.title}**\n${s.content.slice(0, 3000)}`;
  }

  return `You are an AI assistant helping users understand a document.

Document: ${title}

Table of Contents:
${toc}
${focused}

Full document text (truncated to 50,000 chars):
${fullText}

Use the available tools to search the document, retrieve sections, or fact-check claims when needed.
Be concise, accurate, and always cite the document when making claims.`;
}

// ── SSE helpers ────────────────────────────────────────────────────────────

function sseEvent(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

// ── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const { message, section_id, document_data, conversation_history } = body as {
    message: string;
    section_id?: string | null;
    document_data: DocData;
    conversation_history?: Array<{ role: string; content: string }>;
  };

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const systemPrompt = buildSystemPrompt(document_data, section_id);

  // Build message history (last 10 exchanges)
  const messages: Anthropic.MessageParam[] = [
    ...(conversation_history ?? []).slice(-10).map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Agentic loop: up to 5 tool-call rounds
        for (let round = 0; round < 5; round++) {
          // Non-final rounds: check for tool use without streaming
          if (round < 4) {
            const response = await client.messages.create({
              model: CLAUDE_MODEL,
              max_tokens: 2048,
              system: systemPrompt,
              tools: TOOLS,
              messages,
            });

            const toolUses = response.content.filter(b => b.type === "tool_use") as Anthropic.ToolUseBlock[];

            if (toolUses.length === 0 || response.stop_reason !== "tool_use") {
              // No tool calls — stream this response's text
              const text = response.content
                .filter(b => b.type === "text")
                .map(b => (b as Anthropic.TextBlock).text)
                .join("");

              if (text) {
                controller.enqueue(sseEvent({ type: "text_delta", text }));
              }
              break;
            }

            // Execute tool calls
            messages.push({ role: "assistant", content: response.content });
            const toolResults: Anthropic.ToolResultBlockParam[] = toolUses.map(tu => ({
              type: "tool_result",
              tool_use_id: tu.id,
              content: executeTool(tu.name, tu.input as Record<string, string>, document_data),
            }));
            messages.push({ role: "user", content: toolResults });

          } else {
            // Final round: use streaming for real-time output
            const streamResponse = client.messages.stream({
              model: CLAUDE_MODEL,
              max_tokens: 2048,
              system: systemPrompt,
              tools: TOOLS,
              messages,
            });

            for await (const event of streamResponse) {
              if (
                event.type === "content_block_delta" &&
                event.delta.type === "text_delta" &&
                event.delta.text
              ) {
                controller.enqueue(sseEvent({ type: "text_delta", text: event.delta.text }));
              }
            }
            break;
          }
        }

        controller.enqueue(sseEvent({ type: "done" }));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(sseEvent({ type: "error", message: msg }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
