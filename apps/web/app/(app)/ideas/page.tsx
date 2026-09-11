import { Suspense } from "react";
import { IdeasView } from "@/features/ideas/ideas-view";

export const metadata = { title: "Ideas" };

export default function IdeasPage() {
  return (
    <Suspense>
      <IdeasView />
    </Suspense>
  );
}
