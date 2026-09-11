import { ResearchDetail } from "@/features/rd/rd";

export default async function ResearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResearchDetail researchId={id} />;
}
