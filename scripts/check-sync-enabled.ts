import { createServiceClient } from "./shared";

async function checkSyncEnabledColumn() {
  const supabase = createServiceClient();
  const { error } = await supabase.from("modules").select("sync_enabled").limit(1);

  if (!error) {
    console.log("COLUMN_EXISTS");
    return;
  }

  if (error.code === "PGRST204") {
    console.log("COLUMN_MISSING");
    return;
  }

  console.log("ERROR", error.message);
}

void checkSyncEnabledColumn();
