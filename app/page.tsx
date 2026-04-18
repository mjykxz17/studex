import { loadDashboardData } from "@/lib/dashboard";
import DashboardClient from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const dashboard = await loadDashboardData();

  return <DashboardClient data={dashboard} />;
}
