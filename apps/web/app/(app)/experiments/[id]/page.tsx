import { ExperimentDetail } from "@/features/rd/rd";

export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExperimentDetail experimentId={id} />;
}
