import { createServiceClient } from "./shared";

async function auditData() {
  const supabase = createServiceClient();
  const tables = ["modules", "tasks", "announcements", "canvas_files"] as const;

  for (const table of tables) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });

    if (error) {
      console.error(`Error counting ${table}:`, error.message);
      continue;
    }

    console.log(`${table}: ${count}`);
  }

  const { data: files, error } = await supabase.from("canvas_files").select("id, filename").limit(10);

  if (error) {
    console.error("Error fetching canvas_files sample:", error.message);
    return;
  }

  console.log("Sample canvas_files:", files);
}

void auditData();
