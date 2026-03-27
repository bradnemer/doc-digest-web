import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import DocumentViewer from "@/components/DocumentViewer";

type Props = { params: Promise<{ id: string }> };

export default async function DocumentPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/documents/${id}`);

  const sb = await createServiceClient();

  // Owner access
  const { data: doc } = await sb
    .from("documents")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!doc) notFound();
  if (doc.status !== "ready") redirect("/");

  // Fetch document data
  let sections = [];
  if (doc.storage_path) {
    const { data: fileData } = await sb.storage.from("documents").download(doc.storage_path);
    if (fileData) {
      const parsed = JSON.parse(await fileData.text());
      sections = parsed.sections ?? [];
    }
  }

  // Fetch latest version number
  const { data: latestVersion } = await sb
    .from("document_versions")
    .select("version_number")
    .eq("document_id", id)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();

  // Fetch chat history
  const { data: chatMessages } = await sb
    .from("chat_messages")
    .select("*")
    .eq("document_id", id)
    .order("created_at", { ascending: true });

  return (
    <DocumentViewer
      document={doc}
      sections={sections}
      currentVersionNumber={latestVersion?.version_number ?? 1}
      initialChatMessages={chatMessages ?? []}
      isOwner={true}
      isAuthenticated={true}
    />
  );
}
