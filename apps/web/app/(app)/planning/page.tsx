import { PlanningView } from "@/features/planning/planning";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.planning");

export default function PlanningPage() {
  return <PlanningView />;
}
