"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { statusName, useTaskStatuses, type TaskStatus } from "@/lib/statuses";
import type { Task } from "@/lib/types";
import { TaskCard } from "@/features/tasks/task-card";
import { TaskDialog } from "@/features/tasks/task-form";
import {
  DeleteStatusDialog,
  StatusDialog,
  useInvalidateStatuses,
} from "@/features/tasks/status-dialog";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/providers";

type BoardColumn = {
  id: string;
  key: string;
  label: string;
  name: string;
  name_fa?: string | null;
  color: string;
  category: TaskStatus["category"];
  is_system: boolean;
  tasks: Task[];
  count: number;
};

type ColumnActions = {
  onEdit: (key: string) => void;
  onDelete: (key: string) => void;
  onShift: (key: string, direction: -1 | 1) => void;
  onAddAfter: (key: string) => void;
};

function SortableTask({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("touch-none", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} />
    </div>
  );
}

function Column({
  column,
  onAdd,
  canWrite,
  canManage,
  isFirst,
  isLast,
  actions,
}: {
  column: BoardColumn;
  onAdd: (status: string) => void;
  canWrite: boolean;
  canManage: boolean;
  isFirst: boolean;
  isLast: boolean;
  actions: ColumnActions;
}) {
  const { t, locale, n, dir } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: column.key, data: { status: column.key } });
  // "Earlier" on the board is to the right when the page reads right-to-left.
  const Earlier = dir === "rtl" ? ArrowRight : ArrowLeft;
  const Later = dir === "rtl" ? ArrowLeft : ArrowRight;
  return (
    <div className="flex w-[290px] shrink-0 flex-col">
      <div className="group mb-2 flex items-center gap-2 px-1">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: column.color }}
          aria-hidden
        />
        <span className="truncate text-[12px] font-medium">{statusName(column, locale, t)}</span>
        <span className="rounded bg-surface-2 px-1.5 text-[10px] text-muted">{n(column.count)}</span>
        <div className="ms-auto flex items-center">
          {canWrite ? (
            <button
              type="button"
              aria-label={t("tasks.new")}
              onClick={() => onAdd(column.key)}
              className="rounded p-1 text-faint transition-colors hover:bg-surface-2 hover:text-text"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {canManage ? (
            <Dropdown>
              <DropdownTrigger asChild>
                <button
                  type="button"
                  aria-label={t("tasks.status.manage")}
                  className="rounded p-1 text-faint transition-colors hover:bg-surface-2 hover:text-text"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownTrigger>
              <DropdownContent align="end">
                <DropdownItem onSelect={() => actions.onEdit(column.key)}>
                  <Pencil className="h-3.5 w-3.5" />
                  {t("tasks.status.edit")}
                </DropdownItem>
                <DropdownItem onSelect={() => actions.onAddAfter(column.key)}>
                  <Plus className="h-3.5 w-3.5" />
                  {t("tasks.status.addAfter")}
                </DropdownItem>
                <DropdownSeparator />
                <DropdownItem disabled={isFirst} onSelect={() => actions.onShift(column.key, -1)}>
                  <Earlier className="h-3.5 w-3.5" />
                  {t("tasks.status.moveEarlier")}
                </DropdownItem>
                <DropdownItem disabled={isLast} onSelect={() => actions.onShift(column.key, 1)}>
                  <Later className="h-3.5 w-3.5" />
                  {t("tasks.status.moveLater")}
                </DropdownItem>
                {column.is_system ? null : (
                  <>
                    <DropdownSeparator />
                    <DropdownItem destructive onSelect={() => actions.onDelete(column.key)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("action.delete")}
                    </DropdownItem>
                  </>
                )}
              </DropdownContent>
            </Dropdown>
          ) : null}
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[120px] flex-1 flex-col gap-2 rounded-lg border border-dashed border-transparent p-1 transition-colors",
          isOver && "border-accent/40 bg-accent-soft/40",
        )}
      >
        <SortableContext items={column.tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          {column.tasks.map((task) => (
            <SortableTask key={task.id} task={task} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export function TaskBoard({
  projectId,
  mine,
  sprintId,
}: {
  projectId?: string;
  mine?: boolean;
  sprintId?: string;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const { can } = useSession();
  const canWrite = can("tasks.write");
  const canManage = can("tasks.manage");
  const { statuses } = useTaskStatuses();
  const invalidateStatuses = useInvalidateStatuses();
  const [active, setActive] = React.useState<Task | null>(null);
  const [createStatus, setCreateStatus] = React.useState<string | null>(null);
  // null = closed · { status } = editing · { after } = adding a new column
  const [statusDialog, setStatusDialog] = React.useState<
    { status?: TaskStatus; after?: string | null } | null
  >(null);
  const [deleting, setDeleting] = React.useState<TaskStatus | null>(null);

  const findStatus = (key: string) => statuses.find((item) => item.key === key);
  const columnActions: ColumnActions = {
    onEdit: (key) => {
      const status = findStatus(key);
      if (status) setStatusDialog({ status });
    },
    onDelete: (key) => setDeleting(findStatus(key) ?? null),
    onAddAfter: (key) => setStatusDialog({ after: key }),
    onShift: async (key, direction) => {
      const keys = statuses.map((item) => item.key);
      const index = keys.indexOf(key);
      // Cancelled states are not columns; step over them so a move is always visible.
      let target = index + direction;
      while (statuses[target] && statuses[target].category === "cancelled") target += direction;
      if (index < 0 || target < 0 || target >= keys.length) return;
      keys.splice(index, 1);
      keys.splice(target, 0, key);
      try {
        await api.post("/task-statuses/reorder", { keys });
        invalidateStatuses();
      } catch (error: any) {
        toast.error(error?.message ?? t("common.requestFailed"));
      }
    },
  };

  const params = { project_id: projectId, mine: mine || undefined, sprint_id: sprintId };
  const queryKey = ["/tasks/board", params];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get<{ columns: BoardColumn[] }>("/tasks/board", params),
  });

  const move = useMutation({
    mutationFn: ({ id, status, index }: { id: string; status: string; index: number }) =>
      api.post(`/tasks/${id}/move`, { status, order_index: index }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: ["/tasks/board"] });
      client.invalidateQueries({ queryKey: ["/tasks"] });
      client.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error: any) => toast.error(error.message ?? t("common.requestFailed")),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragStart = (event: DragStartEvent) => {
    setActive((event.active.data.current as any)?.task ?? null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActive(null);
    const { active: dragged, over } = event;
    if (!over || !data) return;
    const task = (dragged.data.current as any)?.task as Task | undefined;
    if (!task) return;

    const overData = over.data.current as any;
    const targetStatus: string = overData?.status ?? overData?.task?.status ?? String(over.id);
    const column = data.columns.find((item) => item.key === targetStatus);
    if (!column) return;
    const index = overData?.task
      ? column.tasks.findIndex((item) => item.id === overData.task.id)
      : column.tasks.length;
    if (task.status === targetStatus && column.tasks[index]?.id === task.id) return;

    // Optimistic reorder so the board never feels laggy.
    client.setQueryData(queryKey, (current: { columns: BoardColumn[] } | undefined) => {
      if (!current) return current;
      const columns = current.columns.map((item) => ({
        ...item,
        tasks: item.tasks.filter((entry) => entry.id !== task.id),
      }));
      const target = columns.find((item) => item.key === targetStatus);
      if (target) {
        const position = index < 0 ? target.tasks.length : index;
        target.tasks.splice(position, 0, { ...task, status: targetStatus });
      }
      return { columns: columns.map((item) => ({ ...item, count: item.tasks.length })) };
    });

    move.mutate({ id: task.id, status: targetStatus, index: Math.max(index, 0) });
  };

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-72 w-[290px] shrink-0" />
        ))}
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
      >
        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-3">
          {(data?.columns ?? []).map((column, index, all) => (
            <Column
              key={column.key}
              column={column}
              onAdd={setCreateStatus}
              canWrite={canWrite}
              canManage={canManage}
              isFirst={index === 0}
              isLast={index === all.length - 1}
              actions={columnActions}
            />
          ))}
          {canManage ? (
            <button
              type="button"
              onClick={() => setStatusDialog({ after: null })}
              className="flex h-9 w-[200px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-[12px] text-muted transition-colors hover:border-accent/50 hover:text-text"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("tasks.status.add")}
            </button>
          ) : null}
        </div>
        <DragOverlay>{active ? <TaskCard task={active} dragging /> : null}</DragOverlay>
      </DndContext>

      <TaskDialog
        open={Boolean(createStatus)}
        onOpenChange={(open) => !open && setCreateStatus(null)}
        defaults={{ status: createStatus ?? "todo", project_id: projectId ?? null }}
      />
      <StatusDialog
        open={Boolean(statusDialog)}
        onOpenChange={(open) => !open && setStatusDialog(null)}
        status={statusDialog?.status}
        after={statusDialog?.after}
      />
      <DeleteStatusDialog
        status={deleting}
        statuses={statuses}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </>
  );
}
