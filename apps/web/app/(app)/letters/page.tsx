import { Suspense } from "react";
import { LettersView } from "@/features/letters/letters";

export const metadata = { title: "Letters" };

export default function LettersPage() {
  return (
    <Suspense>
      <LettersView />
    </Suspense>
  );
}
