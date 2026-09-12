import { TicketDetail } from "@/features/support/ticket-detail";

export default async function PortalTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketDetail ticketId={id} />;
}
