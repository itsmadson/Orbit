import { Suspense } from "react";
import { ExperimentsView } from "@/features/rd/rd";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.experiments");

export default function ExperimentsPage() {
  return (
    <Suspense>
      <ExperimentsView />
    </Suspense>
  );
}
