import { CalendarView } from "@/features/meetings/meetings";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.calendar");

export default function CalendarPage() {
  return <CalendarView />;
}
