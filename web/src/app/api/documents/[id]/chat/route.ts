import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/api-auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createServiceClient();

  // Check access: authenticated owner, or public doc
  let hasAccess = false;

  const authResult = await requireAuth();
  if (!authResult.error) {
    const { data: doc } = await supabase
      .from("documents")
      .select("id, is_public")
      .eq("id", id)
      .single();
    if (doc?.is_public || (await supabase.from("documents").select("id").eq("id", id).eq("user_id", authResult.user.id).single()).data) {
      hasAccess = true;
    }
  }

  if (!hasAccess) {
    // Try public access
    const { data: doc } = await supabase
      .from("documents")
      .select("is_public")
      .eq("id", id)
      .single();
    if (doc?.is_public) hasAccess = true;
  }

  if (!hasAccess) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("document_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json(data ?? []);
}
