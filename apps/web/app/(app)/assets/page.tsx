import { Suspense } from "react";
import { AssetsView } from "@/features/assets/assets";

export const metadata = { title: "Assets" };

export default function AssetsPage() {
  return (
    <Suspense>
      <AssetsView />
    </Suspense>
  );
}
