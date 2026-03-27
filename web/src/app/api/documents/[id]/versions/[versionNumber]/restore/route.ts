import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string; versionNumber: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { id, versionNumber } = await params;

  const supabase = await createServiceClient();

  // Verify access
  const { data: doc } = await supabase
    .from("documents")
    .select("id, user_id, is_public, storage_path")
    .eq("id", id)
    .single();

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.user_id !== user.id && !doc.is_public) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const vNum = parseInt(versionNumber);

  // Fetch the source version
  const { data: sourceVersion } = await supabase
    .from("document_versions")
    .select("sections")
    .eq("document_id", id)
    .eq("version_number", vNum)
    .single();

  if (!sourceVersion) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  // Get next version number
  const { data: latest } = await supabase
    .from("document_versions")
    .select("version_number")
    .eq("document_id", id)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latest?.version_number ?? 0) + 1;

  const { data: newVersion } = await supabase
    .from("document_versions")
    .insert({
      document_id: id,
      version_number: nextVersion,
      sections: sourceVersion.sections,
      edited_section: null,
      edited_by_user_id: user.id,
      restore_of: vNum,
    })
    .select("version_number")
    .single();

  // Overwrite document_data.json in Storage
  if (doc.storage_path) {
    const { data: currentData } = await supabase.storage
      .from("documents")
      .download(doc.storage_path);

    if (currentData) {
      const text = await currentData.text();
      const parsed = JSON.parse(text);
      parsed.sections = sourceVersion.sections;
      const updated = JSON.stringify(parsed);
      await supabase.storage
        .from("documents")
        .update(doc.storage_path, new Blob([updated], { type: "application/json" }), {
          upsert: true,
        });
    }
  }

  await supabase
    .from("documents")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ version_number: newVersion?.version_number }, { status: 201 });
}
