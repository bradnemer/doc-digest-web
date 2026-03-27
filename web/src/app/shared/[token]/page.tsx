import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import DocumentViewer from "@/components/DocumentViewer";

type Props = { params: Promise<{ token: string }> };

export default async function SharedDocumentPage({ params }: Props) {
  const { token } = await params;
  const sb = await createServiceClient();

  const { data: doc } = await sb
    .from("documents")
    .select("*")
    .eq("share_token", token)
    .eq("is_public", true)
    .single();

  if (!doc) notFound();

  let sections = [];
  if (doc.storage_path) {
    const { data: fileData } = await sb.storage.from("documents").download(doc.storage_path);
    if (fileData) {
      const parsed = JSON.parse(await fileData.text());
      sections = parsed.sections ?? [];
    }
  }

  const { data: chatMessages } = await sb
    .from("chat_messages")
    .select("*")
    .eq("document_id", doc.id)
    .order("created_at", { ascending: true });

  // Check if visitor is authenticated
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  return (
    <DocumentViewer
      document={doc}
      sections={sections}
      currentVersionNumber={0}
      initialChatMessages={chatMessages ?? []}
      isOwner={false}
      isAuthenticated={!!user}
      isSharedView={true}
    />
  );
}
