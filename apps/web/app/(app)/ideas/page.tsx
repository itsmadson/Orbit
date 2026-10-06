import { Suspense } from "react";
import { IdeasView } from "@/features/ideas/ideas-view";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.ideas");

export default function IdeasPage() {
  return (
    <Suspense>
      <IdeasView />
    </Suspense>
  );
}
