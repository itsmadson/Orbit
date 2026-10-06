import { Suspense } from "react";
import { OfficeView } from "@/features/office/office";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.office");

export default function OfficePage() {
  return (
    <Suspense>
      <OfficeView />
    </Suspense>
  );
}
