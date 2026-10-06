import { Suspense } from "react";
import { DocumentsView } from "@/features/knowledge/wiki";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.documents");

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsView />
    </Suspense>
  );
}
