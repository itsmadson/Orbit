import { DashboardView } from "@/features/dashboard/dashboard";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.home");

export default function HomePage() {
  return <DashboardView />;
}
