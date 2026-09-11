import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_PREFIX, API_URL } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const store = await cookies();
  const refresh = store.get("orbit_refresh")?.value;
  if (refresh) {
    await fetch(`${API_URL}${API_PREFIX}/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
      cache: "no-store",
    }).catch(() => null);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("orbit_access");
  response.cookies.delete("orbit_refresh");
  return response;
}
