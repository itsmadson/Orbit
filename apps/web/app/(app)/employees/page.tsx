import { Suspense } from "react";
import { EmployeesView } from "@/features/people/people";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.employees");

export default function EmployeesPage() {
  return (
    <Suspense>
      <EmployeesView />
    </Suspense>
  );
}
