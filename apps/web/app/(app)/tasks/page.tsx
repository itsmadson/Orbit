import { Suspense } from "react";
import { TasksView } from "@/features/tasks/tasks-view";
import { pageTitle } from "@/lib/page-title";

export const generateMetadata = pageTitle("nav.tasks");

export default function TasksPage() {
  return (
    <Suspense>
      <TasksView />
    </Suspense>
  );
}
