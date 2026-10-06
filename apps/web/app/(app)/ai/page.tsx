import { AiView } from "@/features/ai/ai";
import { pageTitle } from "@/lib/page-title";
export const generateMetadata = pageTitle("nav.ai");
export default function Page() {
  return <AiView />;
}
