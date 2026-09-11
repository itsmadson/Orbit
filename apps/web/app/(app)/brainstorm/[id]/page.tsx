import { BrainstormBoardView } from "@/features/brainstorm/brainstorm";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BrainstormBoardView boardId={id} />;
}
