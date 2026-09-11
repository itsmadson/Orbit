import { LetterDetail } from "@/features/letters/letter-detail";

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LetterDetail letterId={id} />;
}
