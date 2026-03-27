import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Dashboard from "@/components/Dashboard";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return <Dashboard initialDocuments={documents ?? []} userEmail={user.email ?? ""} />;
}
