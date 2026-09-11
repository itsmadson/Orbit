import { Suspense } from "react";
import { RdListView } from "@/features/rd/rd";

export const metadata = { title: "R&D" };

export default function RdPage() {
  return (
    <Suspense>
      <RdListView />
    </Suspense>
  );
}
