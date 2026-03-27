import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  const supabase = await createServiceClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, source_filename, page_count, section_count, storage_path, is_public")
    .eq("share_token", token)
    .single();

  if (!doc?.is_public) {
    return NextResponse.json({ error: "This document is not available." }, { status: 404 });
  }

  let sections = [];
  if (doc.storage_path) {
    const { data: fileData } = await supabase.storage
      .from("documents")
      .download(doc.storage_path);
    if (fileData) {
      const parsed = JSON.parse(await fileData.text());
      sections = parsed.sections ?? [];
    }
  }

  return NextResponse.json({
    document: {
      id: doc.id,
      title: doc.title,
      source_filename: doc.source_filename,
      page_count: doc.page_count,
      section_count: doc.section_count,
    },
    sections,
  });
}
