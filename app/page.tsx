import { loadDashboardData } from "@/lib/dashboard";
import DashboardClient from "./dashboard-client";

// Revalidate every 60s — avoids hitting DB + NUSMods API on every request
export const revalidate = 60;

export default async function Home() {
  const dashboard = await loadDashboardData();

  return <DashboardClient data={dashboard} />;
}
