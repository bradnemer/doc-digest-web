import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { internalHeaders, SUPABASE_EDGE_FUNCTION_URL } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const { document_id, section_id } = await request.json();
  if (!document_id || !section_id) {
    return NextResponse.json({ followups: [] });
  }

  const supabase = await createServiceClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", document_id)
    .single();

  if (!doc?.storage_path) return NextResponse.json({ followups: [] });

  const { data: fileData } = await supabase.storage
    .from("documents")
    .download(doc.storage_path);

  if (!fileData) return NextResponse.json({ followups: [] });

  const documentData = JSON.parse(await fileData.text());

  try {
    const resp = await fetch(`${SUPABASE_EDGE_FUNCTION_URL}/followups`, {
      method: "POST",
      headers: internalHeaders(),
      body: JSON.stringify({ section_id, document_data: documentData }),
    });
    const data = await resp.json();
    return NextResponse.json({ followups: data.followups ?? [] });
  } catch {
    return NextResponse.json({ followups: [] });
  }
}
