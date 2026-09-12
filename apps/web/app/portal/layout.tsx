import { redirect } from "next/navigation";
import { PortalShell } from "@/features/portal/portal";
import { getSession } from "@/lib/server";

export const metadata = { title: "Portal" };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Staff get the full app; the portal is only ever for customer logins.
  if (session.user.role !== "customer") redirect("/");
  return <PortalShell>{children}</PortalShell>;
}
