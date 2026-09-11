import { Suspense } from "react";
import { DocumentsView } from "@/features/knowledge/wiki";

export const metadata = { title: "Documents" };

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsView />
    </Suspense>
  );
}
