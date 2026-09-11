import { EmployeeProfile } from "@/features/people/people";

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmployeeProfile userId={id} />;
}
