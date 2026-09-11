import { Suspense } from "react";
import { FinanceView } from "@/features/finance/finance";

export const metadata = { title: "Finance" };

export default function FinancePage() {
  return (
    <Suspense>
      <FinanceView />
    </Suspense>
  );
}
