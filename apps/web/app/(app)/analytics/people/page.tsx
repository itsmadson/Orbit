import { PeopleAnalytics } from "@/features/analytics/analytics";
import { pageTitle } from "@/lib/page-title";
export const generateMetadata = pageTitle("analytics.title.people");
export default function Page() {
  return <PeopleAnalytics />;
}
