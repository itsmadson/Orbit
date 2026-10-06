import { BrainstormListView } from "@/features/brainstorm/brainstorm";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.brainstorm");

export default function BrainstormPage() {
  return <BrainstormListView />;
}
