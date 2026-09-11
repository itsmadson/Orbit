import { Suspense } from "react";
import { MeetingsView } from "@/features/meetings/meetings";

export const metadata = { title: "Meetings" };

export default function MeetingsPage() {
  return (
    <Suspense>
      <MeetingsView />
    </Suspense>
  );
}
