import { Suspense } from "react";
import { GoalsView } from "@/features/goals/goals";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.goals");

export default function GoalsPage() {
  return (
    <Suspense>
      <GoalsView />
    </Suspense>
  );
}
