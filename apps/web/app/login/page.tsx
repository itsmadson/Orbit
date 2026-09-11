import { redirect } from "next/navigation";
import { getSession } from "@/lib/server";
import { LoginForm } from "@/features/auth/login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");
  return <LoginForm />;
}
