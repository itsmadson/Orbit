import { Suspense } from "react";
import { RdListView } from "@/features/rd/rd";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.rd");

export default function RdPage() {
  return (
    <Suspense>
      <RdListView />
    </Suspense>
  );
}
