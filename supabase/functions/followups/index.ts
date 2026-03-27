import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";

const INTERNAL_SECRET = Deno.env.get("INTERNAL_API_SECRET") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL_ID") ?? "claude-sonnet-4-6";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Internal-Secret",
};

interface Section {
  id: string;
  title: string;
  content: string;
}

interface DocData {
  sections?: Section[];
}

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

  const { section_id, document_data } = await req.json() as {
    section_id: string;
    document_data: DocData;
  };

  const section = document_data.sections?.find(s => s.id === section_id);
  if (!section) {
    return new Response(JSON.stringify({ followups: [] }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const prompt = `Given this document section, generate exactly 3 insightful follow-up questions a reader might ask.

Section title: ${section.title}
Section content (first 2000 chars):
${section.content.slice(0, 2000)}

Return ONLY a JSON array of 3 question strings, no other text or markdown. Example:
["Question 1?", "Question 2?", "Question 3?"]`;

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "[]";
    const match = text.match(/\[[\s\S]*?\]/);
    const followups = match ? JSON.parse(match[0]).slice(0, 3) : [];

    return new Response(JSON.stringify({ followups }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ followups: [] }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
