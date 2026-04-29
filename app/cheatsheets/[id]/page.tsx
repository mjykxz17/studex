// app/cheatsheets/[id]/page.tsx
import { notFound } from "next/navigation";

import { CheatsheetViewer } from "@/app/ui/cheatsheet/cheatsheet-viewer";
import { ensureDemoUser } from "@/lib/demo-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export default async function CheatsheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("cheatsheets")
    .select("id, user_id, title, markdown, citations, status, failure_reason")
    .eq("id", id)
    .maybeSingle();
  if (!data || (data as { user_id: string }).user_id !== user.id) notFound();
  return (
    <main className="p-6">
      <CheatsheetViewer cheatsheet={data as Parameters<typeof CheatsheetViewer>[0]["cheatsheet"]} />
    </main>
  );
}
