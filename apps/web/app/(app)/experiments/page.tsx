import { Suspense } from "react";
import { ExperimentsView } from "@/features/rd/rd";

export const metadata = { title: "Experiments" };

export default function ExperimentsPage() {
  return (
    <Suspense>
      <ExperimentsView />
    </Suspense>
  );
}
