import { FinanceAnalytics } from "@/features/analytics/analytics";
import { pageTitle } from "@/lib/page-title";
export const generateMetadata = pageTitle("analytics.title.finance");
export default function Page() {
  return <FinanceAnalytics />;
}
