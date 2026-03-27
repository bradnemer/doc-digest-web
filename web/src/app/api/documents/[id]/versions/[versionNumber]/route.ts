import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string; versionNumber: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { id, versionNumber } = await params;

  const supabase = await createServiceClient();

  // Verify access
  const { data: doc } = await supabase
    .from("documents")
    .select("id, user_id, is_public")
    .eq("id", id)
    .single();

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.user_id !== user.id && !doc.is_public) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: version } = await supabase
    .from("document_versions")
    .select("version_number, sections")
    .eq("document_id", id)
    .eq("version_number", parseInt(versionNumber))
    .single();

  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  return NextResponse.json(version);
}
