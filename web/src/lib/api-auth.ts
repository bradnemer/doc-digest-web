/**
 * Shared helpers for API route auth and internal service calls.
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

export async function requireAuth(): Promise<
  { user: User; error: null } | { user: null; error: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user, error: null };
}

export function internalHeaders() {
  return {
    "Content-Type": "application/json",
    "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
  };
}

export const SUPABASE_EDGE_FUNCTION_URL =
  process.env.SUPABASE_EDGE_FUNCTION_URL ?? "http://localhost:54321/functions/v1";
