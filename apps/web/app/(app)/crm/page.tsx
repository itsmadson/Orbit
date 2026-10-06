import { Suspense } from "react";
import { CrmView } from "@/features/crm/crm";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.crm");

export default function CrmPage() {
  return (
    <Suspense>
      <CrmView />
    </Suspense>
  );
}
