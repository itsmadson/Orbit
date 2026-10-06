import { ProcurementView } from "@/features/assets/assets";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.procurement");

export default function ProcurementPage() {
  return <ProcurementView />;
}
