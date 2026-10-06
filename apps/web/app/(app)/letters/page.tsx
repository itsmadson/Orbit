import { Suspense } from "react";
import { LettersView } from "@/features/letters/letters";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.letters");

export default function LettersPage() {
  return (
    <Suspense>
      <LettersView />
    </Suspense>
  );
}
