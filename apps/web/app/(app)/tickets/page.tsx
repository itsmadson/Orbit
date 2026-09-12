import { Suspense } from "react";
import { TicketsView } from "@/features/support/tickets";

export const metadata = { title: "Tickets" };

export default function TicketsPage() {
  return (
    <Suspense>
      <TicketsView />
    </Suspense>
  );
}
