import type { NextResponse } from "next/server";

/** Session tokens live in httpOnly cookies so the browser never touches them. */
export function setSessionCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
) {
  const secure = process.env.NODE_ENV === "production" && process.env.ORBIT_HTTPS === "true";
  response.cookies.set("orbit_access", accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60,
  });
  response.cookies.set("orbit_refresh", refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}
