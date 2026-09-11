import { NextRequest, NextResponse } from "next/server";
import { setSessionCookies } from "@/lib/cookies";
import { API_PREFIX, API_URL } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const payload = await request.json();
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}${API_PREFIX}/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
        "user-agent": request.headers.get("user-agent") ?? "",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { code: "upstream_unavailable", message: "The ORBIT API is not reachable." },
      { status: 502 },
    );
  }

  const data = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return NextResponse.json(data ?? { code: "error", message: "Sign in failed" }, {
      status: upstream.status,
    });
  }

  const response = NextResponse.json({ ok: true });
  setSessionCookies(response, data.access_token, data.refresh_token);
  return response;
}
