"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useCreateParam, useDebounced, useList } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { Task } from "@/lib/types";
import { PageHeader } from "@/components/shared/page";
import { FilterChips, SearchInput, Toolbar } from "@/components/shared/data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import { TaskBoard } from "@/features/tasks/task-board";
import { TaskTable } from "@/features/tasks/task-list";
import { TaskDialog } from "@/features/tasks/task-form";
import { useProjects } from "@/components/shared/pickers";
import { humanize } from "@/lib/utils";

export function TasksView() {
  const t = useT();
  const params = useSearchParams();
  const { can, user } = useSession();
  const [createOpen, setCreateOpen] = useCreateParam();
  const [tab, setTab] = React.useState(params.get("mine") ? "mine" : "board");
  const [query, setQuery] = React.useState("");
  const [projectId, setProjectId] = React.useState<string>("");
  const [priority, setPriority] = React.useState<string | undefined>();
  const [page, setPage] = React.useState(1);
  const search = useDebounced(query);
  const projects = useProjects();

  const overdue = params.get("overdue") === "true";

  const listQuery = useList<Task>("/tasks", {
    q: search,
    project_id: projectId || undefined,
    priority: priority ? [priority] : undefined,
    overdue: overdue || undefined,
    page,
    page_size: 40,
    sort: "updated",
  });

  const mineQuery = useList<Task>("/tasks", {
    mine: true,
    open_only: true,
    page,
    page_size: 40,
    sort: "due",
  });

  const backlogQuery = useList<Task>("/tasks", {
    status: ["backlog"],
    project_id: projectId || undefined,
    page,
    page_size: 40,
  });

  const filters = (
    <Toolbar>
      <SearchInput value={query} onChange={setQuery} className="w-56" />
      <SimpleSelect
        value={projectId}
        onValueChange={setProjectId}
        placeholder={t("common.project")}
        className="w-48"
        options={[
          { value: "", label: t("common.all") },
          ...(projects.data?.items ?? []).map((project) => ({
            value: project.id,
            label: `${project.icon} ${project.name}`,
          })),
        ]}
      />
      <FilterChips
        value={priority}
        onChange={setPriority}
        options={["urgent", "high", "medium", "low"].map((value) => ({
          value,
          label: humanize(value),
        }))}
      />
    </Toolbar>
  );

  return (
    <div>
      <PageHeader
        title={t("tasks.title")}
        subtitle={overdue ? t("common.overdue") : undefined}
        actions={
          can("tasks.write") ? (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("tasks.new")}
            </Button>
          ) : null
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="pill" className="mb-4">
          <TabsTrigger variant="pill" value="board">{t("tasks.kanban")}</TabsTrigger>
          <TabsTrigger variant="pill" value="list">{t("projects.list")}</TabsTrigger>
          <TabsTrigger variant="pill" value="mine">{t("tasks.myTasks")}</TabsTrigger>
          <TabsTrigger variant="pill" value="backlog">{t("tasks.backlog")}</TabsTrigger>
        </TabsList>

        <TabsContent value="board">
          {filters}
          <TaskBoard projectId={projectId || undefined} />
        </TabsContent>
        <TabsContent value="list">
          {filters}
          <TaskTable data={listQuery.data} loading={listQuery.isLoading} onPage={setPage} />
        </TabsContent>
        <TabsContent value="mine">
          <TaskTable data={mineQuery.data} loading={mineQuery.isLoading} onPage={setPage} />
        </TabsContent>
        <TabsContent value="backlog">
          {filters}
          <TaskTable data={backlogQuery.data} loading={backlogQuery.isLoading} onPage={setPage} />
        </TabsContent>
      </Tabs>

      <TaskDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
