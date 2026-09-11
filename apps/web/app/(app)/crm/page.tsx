import { Suspense } from "react";
import { CrmView } from "@/features/crm/crm";

export const metadata = { title: "CRM" };

export default function CrmPage() {
  return (
    <Suspense>
      <CrmView />
    </Suspense>
  );
}
