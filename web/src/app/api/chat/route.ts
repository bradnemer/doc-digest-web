/**
 * POST /api/chat — fetch document data, proxy to FastAPI for SSE streaming,
 * persist user+assistant messages on completion.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { internalHeaders, SUPABASE_EDGE_FUNCTION_URL } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { message, section_id, document_id, conversation_history } = body;

  if (!message || !document_id) {
    return NextResponse.json({ error: "message and document_id required" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  // Verify document exists and is accessible
  const { data: doc } = await supabase
    .from("documents")
    .select("id, storage_path, is_public, user_id")
    .eq("id", document_id)
    .single();

  if (!doc?.storage_path) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Determine sender identity
  let userId: string | null = null;
  let displayName = "Anonymous";
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (user) {
      userId = user.id;
      displayName = user.email ?? "User";
    }
  } catch {
    // Unauthenticated — leave as Anonymous
  }

  // Fetch document_data.json from Storage
  const { data: fileData, error: fileErr } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);

  if (fileErr || !fileData) {
    return NextResponse.json({ error: "Could not load document data" }, { status: 500 });
  }

  const documentData = JSON.parse(await fileData.text());

  // Stream from Edge Function, collect full text for persistence
  const encoder = new TextEncoder();
  let fullAssistantText = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const resp = await fetch(`${SUPABASE_EDGE_FUNCTION_URL}/chat`, {
          method: "POST",
          headers: internalHeaders(),
          body: JSON.stringify({
            message,
            section_id: section_id ?? null,
            document_data: documentData,
            conversation_history: conversation_history ?? [],
          }),
        });

        if (!resp.ok) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: "AI service error" })}\n\n`));
          controller.close();
          return;
        }

        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === "text_delta" && event.text) {
                fullAssistantText += event.text;
              }
              controller.enqueue(encoder.encode(line + "\n\n"));
            } catch {
              // Skip malformed
            }
          }
        }

        controller.close();

        // Persist messages after stream completes
        await supabase.from("chat_messages").insert([
          {
            document_id,
            role: "user",
            content: message,
            section_id: section_id ?? null,
            user_id: userId,
            display_name: displayName,
          },
          {
            document_id,
            role: "assistant",
            content: fullAssistantText,
            section_id: section_id ?? null,
            user_id: null,
            display_name: "AI",
          },
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
