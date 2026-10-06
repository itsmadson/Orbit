import { GraphView } from "@/features/graph/graph";
import { pageTitle } from "@/lib/page-title";
export const generateMetadata = pageTitle("nav.graph");
export default function Page() {
  return <GraphView />;
}
