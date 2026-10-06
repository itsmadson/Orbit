import { RoadmapsView } from "@/features/projects/roadmaps";
import { pageTitle } from "@/lib/page-title";
export const generateMetadata = pageTitle("nav.roadmaps");
export default function Page() {
  return <RoadmapsView />;
}
