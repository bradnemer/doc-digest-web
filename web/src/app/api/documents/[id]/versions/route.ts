import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

async function getDocumentForUser(supabase: Awaited<ReturnType<typeof createServiceClient>>, docId: string, userId: string) {
  // Owner access
  const { data: ownedDoc } = await supabase
    .from("documents")
    .select("id, user_id, is_public, storage_path")
    .eq("id", docId)
    .eq("user_id", userId)
    .single();
  if (ownedDoc) return ownedDoc;

  // Public doc access for authenticated users
  const { data: publicDoc } = await supabase
    .from("documents")
    .select("id, user_id, is_public, storage_path")
    .eq("id", docId)
    .eq("is_public", true)
    .single();
  return publicDoc;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const supabase = await createServiceClient();
  const doc = await getDocumentForUser(supabase, id, user.id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data } = await supabase
    .from("document_versions")
    .select("version_number, edited_section, edited_by_user_id, restore_of, created_at")
    .eq("document_id", id)
    .order("version_number", { ascending: false });

  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const supabase = await createServiceClient();
  const doc = await getDocumentForUser(supabase, id, user.id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { sections, edited_section } = await request.json();
  if (!sections) return NextResponse.json({ error: "sections required" }, { status: 400 });

  // Get next version number
  const { data: latest } = await supabase
    .from("document_versions")
    .select("version_number")
    .eq("document_id", id)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latest?.version_number ?? 0) + 1;

  const { data: version, error: vErr } = await supabase
    .from("document_versions")
    .insert({
      document_id: id,
      version_number: nextVersion,
      sections,
      edited_section: edited_section ?? null,
      edited_by_user_id: user.id,
    })
    .select("version_number, created_at")
    .single();

  if (vErr || !version) {
    return NextResponse.json({ error: "Failed to save version" }, { status: 500 });
  }

  // Overwrite document_data.json in Storage
  if (doc.storage_path) {
    // Fetch current document_data to merge
    const { data: currentData } = await supabase.storage
      .from("documents")
      .download(doc.storage_path);

    if (currentData) {
      const text = await currentData.text();
      const parsed = JSON.parse(text);
      parsed.sections = sections;
      const updated = JSON.stringify(parsed);
      await supabase.storage
        .from("documents")
        .update(doc.storage_path, new Blob([updated], { type: "application/json" }), {
          upsert: true,
        });
    }
  }

  // Touch updated_at on document
  await supabase
    .from("documents")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json(version, { status: 201 });
}
