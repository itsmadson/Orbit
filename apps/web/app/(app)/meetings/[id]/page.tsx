import { MeetingDetail } from "@/features/meetings/meetings";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MeetingDetail meetingId={id} />;
}
