import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { setSessionCookies } from "@/lib/cookies";
import { API_PREFIX, API_URL } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * BFF proxy: the browser never sees a token. Access and refresh tokens live in
 * httpOnly cookies; this handler attaches the access token, transparently
 * refreshes it once on 401, and forwards everything else to the FastAPI domain
 * API untouched.
 */
async function proxy(request: NextRequest, path: string[]) {
  const store = await cookies();
  const access = store.get("orbit_access")?.value;
  const refresh = store.get("orbit_refresh")?.value;
  const search = request.nextUrl.search;
  const target = `${API_URL}${API_PREFIX}/${path.join("/")}${search}`;

  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");
  const body =
    request.method === "GET" || request.method === "DELETE"
      ? undefined
      : isMultipart
        ? await request.arrayBuffer()
        : await request.text();

  const headers: Record<string, string> = {};
  if (contentType) headers["content-type"] = contentType;
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  const userAgent = request.headers.get("user-agent");
  if (userAgent) headers["user-agent"] = userAgent;

  const send = (token?: string) =>
    fetch(target, {
      method: request.method,
      headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers,
      body: body as BodyInit | undefined,
      cache: "no-store",
    });

  let upstream: Response;
  try {
    upstream = await send(access);
  } catch {
    return NextResponse.json(
      { code: "upstream_unavailable", message: "The ORBIT API is not reachable." },
      { status: 502 },
    );
  }

  let refreshed: { access_token: string; refresh_token: string } | null = null;
  if (upstream.status === 401 && refresh) {
    const refreshResponse = await fetch(`${API_URL}${API_PREFIX}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
      cache: "no-store",
    });
    if (refreshResponse.ok) {
      refreshed = await refreshResponse.json();
      upstream = await send(refreshed!.access_token);
    }
  }

  const responseBody = await upstream.arrayBuffer();
  const response = new NextResponse(responseBody, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      ...(upstream.headers.get("content-disposition")
        ? { "content-disposition": upstream.headers.get("content-disposition")! }
        : {}),
    },
  });

  if (refreshed) {
    setSessionCookies(response, refreshed.access_token, refreshed.refresh_token);
  }
  return response;
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}
export async function POST(request: NextRequest, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}
export async function PATCH(request: NextRequest, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}
export async function PUT(request: NextRequest, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}
export async function DELETE(request: NextRequest, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}
