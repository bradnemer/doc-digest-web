/**
 * POST /api/documents — create document record + trigger extraction
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, internalHeaders, SUPABASE_EDGE_FUNCTION_URL } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/supabase/server";

const MAX_DOCS = 20;

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { filename, storage_path, source_type } = body;

  if (!filename || !storage_path || !source_type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  // Enforce 20-document limit
  const { count } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("status", "eq", "failed");

  if ((count ?? 0) >= MAX_DOCS) {
    return NextResponse.json(
      { error: "You've reached the 20-document limit. Delete a document to upload a new one." },
      { status: 400 }
    );
  }

  // Create document record
  const { data: doc, error: insertErr } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      title: filename.replace(/\.[^.]+$/, ""),
      source_filename: filename,
      source_type,
      status: "processing",
      raw_file_path: storage_path,
    })
    .select()
    .single();

  if (insertErr || !doc) {
    return NextResponse.json({ error: "Failed to create document" }, { status: 500 });
  }

  // Trigger extraction (fire and forget — Edge Function runs async)
  fetch(`${SUPABASE_EDGE_FUNCTION_URL}/extract`, {
    method: "POST",
    headers: internalHeaders(),
    body: JSON.stringify({
      document_id: doc.id,
      user_id: user.id,
      raw_file_path: storage_path,
      source_type,
    }),
  }).catch(console.error);

  return NextResponse.json({ id: doc.id, status: "processing" }, { status: 201 });
}

export async function GET() {
  const { user, error } = await requireAuth();
  if (error) return error;

  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("documents")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return NextResponse.json(data ?? []);
}
