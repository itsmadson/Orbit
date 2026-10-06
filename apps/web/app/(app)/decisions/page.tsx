import { Suspense } from "react";
import { DecisionsView } from "@/features/decisions/decisions";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.decisions");

export default function DecisionsPage() {
  return (
    <Suspense>
      <DecisionsView />
    </Suspense>
  );
}
