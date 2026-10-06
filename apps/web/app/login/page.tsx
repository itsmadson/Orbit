import { redirect } from "next/navigation";
import { getSession } from "@/lib/server";
import { LoginForm } from "@/features/auth/login-form";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("auth.signInTitle");

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");
  return <LoginForm />;
}
