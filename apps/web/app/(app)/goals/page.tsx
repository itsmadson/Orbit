import { Suspense } from "react";
import { GoalsView } from "@/features/goals/goals";

export const metadata = { title: "Goals" };

export default function GoalsPage() {
  return (
    <Suspense>
      <GoalsView />
    </Suspense>
  );
}
