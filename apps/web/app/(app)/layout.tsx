import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getSession } from "@/lib/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  // A customer login has no business in the staff shell; redirecting on the
  // server means none of it is ever sent to them.
  if (session.user.role === "customer") redirect("/portal");
  return <AppShell>{children}</AppShell>;
}
