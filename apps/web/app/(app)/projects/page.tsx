import { ProjectListView } from "@/features/projects/project-list";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.projects");

export default function ProjectsPage() {
  return <ProjectListView />;
}
