/**
 * POST /api/upload-url — generate a signed upload URL for direct browser-to-Storage upload
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/server";

const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const { filename, size } = await request.json();

  if (size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 25 MB limit." }, { status: 400 });
  }

  const ext = filename.split(".").pop()?.toLowerCase();
  if (!["pdf", "md", "markdown"].includes(ext ?? "")) {
    return NextResponse.json(
      { error: "Only PDF and Markdown files are supported." },
      { status: 400 }
    );
  }

  const docId = crypto.randomUUID();
  const storagePath = `${user.id}/${docId}/source.${ext}`;

  const supabase = await createServiceClient();
  const { data, error: urlErr } = await supabase.storage
    .from("documents")
    .createSignedUploadUrl(storagePath);

  if (urlErr || !data) {
    return NextResponse.json({ error: "Could not generate upload URL" }, { status: 500 });
  }

  return NextResponse.json({
    signed_url: data.signedUrl,
    storage_path: storagePath,
    document_id: docId,
  });
}
