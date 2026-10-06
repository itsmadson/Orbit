import { Suspense } from "react";
import { AssetsView } from "@/features/assets/assets";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.assets");

export default function AssetsPage() {
  return (
    <Suspense>
      <AssetsView />
    </Suspense>
  );
}
