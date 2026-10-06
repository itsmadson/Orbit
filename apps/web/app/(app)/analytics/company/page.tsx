import { CompanyAnalytics } from "@/features/analytics/analytics";
import { pageTitle } from "@/lib/page-title";
export const generateMetadata = pageTitle("analytics.title.company");
export default function Page() {
  return <CompanyAnalytics />;
}
