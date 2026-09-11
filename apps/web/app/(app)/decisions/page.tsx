import { Suspense } from "react";
import { DecisionsView } from "@/features/decisions/decisions";

export const metadata = { title: "Decisions" };

export default function DecisionsPage() {
  return (
    <Suspense>
      <DecisionsView />
    </Suspense>
  );
}
