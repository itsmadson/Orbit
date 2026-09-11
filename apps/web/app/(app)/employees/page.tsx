import { Suspense } from "react";
import { EmployeesView } from "@/features/people/people";

export const metadata = { title: "Employees" };

export default function EmployeesPage() {
  return (
    <Suspense>
      <EmployeesView />
    </Suspense>
  );
}
