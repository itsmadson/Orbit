import { Suspense } from "react";
import { TicketsView } from "@/features/support/tickets";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.tickets");

export default function TicketsPage() {
  return (
    <Suspense>
      <TicketsView />
    </Suspense>
  );
}
