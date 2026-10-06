import { ProjectAnalytics } from "@/features/analytics/analytics";
import { pageTitle } from "@/lib/page-title";
export const generateMetadata = pageTitle("analytics.title.projects");
export default function Page() {
  return <ProjectAnalytics />;
}
