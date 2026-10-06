import { ApprovalsView } from "@/features/office/office";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.approvals");

export default function ApprovalsPage() {
  return <ApprovalsView />;
}
