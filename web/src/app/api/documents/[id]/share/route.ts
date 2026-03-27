import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const { is_public } = await request.json();
  const supabase = await createServiceClient();

  const { data: doc } = await supabase
    .from("documents")
    .update({ is_public })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("share_token, is_public")
    .single();

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return NextResponse.json({
    is_public: doc.is_public,
    share_token: doc.share_token,
    share_url: `${appUrl}/shared/${doc.share_token}`,
  });
}
