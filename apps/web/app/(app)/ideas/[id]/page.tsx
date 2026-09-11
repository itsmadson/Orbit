import { IdeaDetail } from "@/features/ideas/idea-detail";

export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IdeaDetail ideaId={id} />;
}
