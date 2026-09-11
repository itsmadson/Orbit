import { Suspense } from "react";
import { OfficeView } from "@/features/office/office";

export const metadata = { title: "Office" };

export default function OfficePage() {
  return (
    <Suspense>
      <OfficeView />
    </Suspense>
  );
}
