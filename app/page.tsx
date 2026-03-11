import { loadDashboardData } from "@/lib/dashboard";
import DashboardClient from "./dashboard-client";

export default async function Home() {
  const dashboard = await loadDashboardData();

  return <DashboardClient data={dashboard} />;
}
