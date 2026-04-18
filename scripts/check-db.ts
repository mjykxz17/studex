import { createServiceClient } from "./shared";

async function checkData() {
  const supabase = createServiceClient();

  const { data: users, error: userError } = await supabase.from("users").select("*");
  console.log("Users:", users?.length || 0);
  if (userError) {
    console.error(userError.message);
  }

  const { data: modules, error: moduleError } = await supabase.from("modules").select("*").limit(1);
  console.log("Modules:", modules?.length || 0);
  if (modules && modules.length > 0) {
    console.log("Sample module:", modules[0]);
  }
  if (moduleError) {
    console.error(moduleError.message);
  }

  const { data: syncLogs, error: syncLogError } = await supabase
    .from("sync_log")
    .select("*")
    .order("ran_at", { ascending: false })
    .limit(5);
  if (syncLogError) {
    console.error(syncLogError.message);
  }

  console.log("Recent sync logs:", syncLogs);
}

void checkData();
