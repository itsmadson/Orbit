import { WorkflowsView } from "@/features/office/office";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.workflows");

export default function WorkflowsPage() {
  return <WorkflowsView />;
}
