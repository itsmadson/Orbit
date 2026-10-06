import { Suspense } from "react";
import { WikiView } from "@/features/knowledge/wiki";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.wiki");

export default function WikiPage() {
  return (
    <Suspense>
      <WikiView />
    </Suspense>
  );
}
