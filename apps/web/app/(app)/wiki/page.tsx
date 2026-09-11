import { Suspense } from "react";
import { WikiView } from "@/features/knowledge/wiki";

export const metadata = { title: "Wiki" };

export default function WikiPage() {
  return (
    <Suspense>
      <WikiView />
    </Suspense>
  );
}
