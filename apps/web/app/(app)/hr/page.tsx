import { HrView } from "@/features/people/people";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.hr");

export default function HrPage() {
  return <HrView />;
}
