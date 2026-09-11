import { DocumentDetail } from "@/features/knowledge/wiki";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentDetail documentId={id} />;
}
