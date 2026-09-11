import { cookies } from "next/headers";

export const API_URL = process.env.ORBIT_API_URL ?? "http://orbit-api:8000";
export const API_PREFIX = "/api/v1";

export type SessionUser = {
  user: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    title?: string | null;
    avatar_color: string;
    locale: string;
    theme: string;
    department?: { id: string; name: string; color: string } | null;
  };
  company: { id: string; name: string; slug: string; logo_emoji: string; currency: string };
  permissions: string[];
  unread_notifications: number;
};

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get("orbit_access")?.value;
  if (!token) return null;
  try {
    const response = await fetch(`${API_URL}${API_PREFIX}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as SessionUser;
  } catch {
    return null;
  }
}
