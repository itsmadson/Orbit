import { NextResponse } from "next/server";
import { API_URL } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  let api = "unavailable";
  try {
    const response = await fetch(`${API_URL}/health`, { cache: "no-store" });
    api = response.ok ? "ok" : "degraded";
  } catch {
    api = "unavailable";
  }
  return NextResponse.json({ status: "ok", api });
}
