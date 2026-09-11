import { CustomerDetail } from "@/features/crm/crm";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerDetail customerId={id} />;
}
