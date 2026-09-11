import { RequestDetail } from "@/features/office/office";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequestDetail requestId={id} />;
}
