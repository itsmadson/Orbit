import { InboxView } from "@/features/inbox/inbox";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.inbox");

export default function InboxPage() {
  return <InboxView />;
}
