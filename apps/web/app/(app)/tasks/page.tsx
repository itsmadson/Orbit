import { Suspense } from "react";
import { TasksView } from "@/features/tasks/tasks-view";

export const metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <Suspense>
      <TasksView />
    </Suspense>
  );
}
