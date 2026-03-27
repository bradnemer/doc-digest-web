import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const { user, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;

  const supabase = await createServiceClient();

  // Generate new share token via raw SQL since Supabase client doesn't expose gen_random_uuid()
  const { data } = await supabase
    .from("documents")
    .update({ share_token: crypto.randomUUID() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("share_token")
    .single();

  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return NextResponse.json({
    share_token: data.share_token,
    share_url: `${appUrl}/shared/${data.share_token}`,
  });
}
