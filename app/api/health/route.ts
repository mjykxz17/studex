import { NextResponse } from "next/server";

import { getServerHealth } from "@/lib/config";

export async function GET() {
  const health = getServerHealth();

  return NextResponse.json(health, {
    status: health.ok ? 200 : 503,
  });
}
