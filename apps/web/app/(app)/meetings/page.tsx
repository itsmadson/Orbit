import { Suspense } from "react";
import { MeetingsView } from "@/features/meetings/meetings";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.meetings");

export default function MeetingsPage() {
  return (
    <Suspense>
      <MeetingsView />
    </Suspense>
  );
}
