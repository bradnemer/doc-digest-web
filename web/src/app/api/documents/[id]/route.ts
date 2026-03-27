import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const supabase = await createServiceClient();

  // Fetch to verify ownership and get storage paths
  const { data: doc } = await supabase
    .from("documents")
    .select("user_id, raw_file_path, storage_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete Storage files
  const paths = [doc.raw_file_path, doc.storage_path].filter(Boolean) as string[];
  if (paths.length) {
    await supabase.storage.from("documents").remove(paths);
  }

  // Delete DB row (cascades to versions and chat_messages)
  await supabase.from("documents").delete().eq("id", id);

  return new NextResponse(null, { status: 204 });
}
