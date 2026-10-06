import { MonitorsView } from "@/features/support/monitors";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.monitors");

export default function MonitorsPage() {
  return <MonitorsView />;
}
