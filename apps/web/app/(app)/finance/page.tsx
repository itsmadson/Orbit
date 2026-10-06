import { Suspense } from "react";
import { FinanceView } from "@/features/finance/finance";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.finance");

export default function FinancePage() {
  return (
    <Suspense>
      <FinanceView />
    </Suspense>
  );
}
