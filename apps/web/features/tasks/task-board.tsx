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
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Task } from "@/lib/types";
import { TaskCard } from "@/features/tasks/task-card";
import { TaskDialog } from "@/features/tasks/task-form";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/providers";

type BoardColumn = { key: string; label: string; tasks: Task[]; count: number };

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
}: {
  column: BoardColumn;
  onAdd: (status: string) => void;
  canWrite: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key, data: { status: column.key } });
  return (
    <div className="flex w-[290px] shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-[12px] font-medium">{column.label}</span>
        <span className="rounded bg-surface-2 px-1.5 text-[10px] text-muted">{column.count}</span>
        {canWrite ? (
          <button
            type="button"
            onClick={() => onAdd(column.key)}
            className="ms-auto rounded p-1 text-faint transition-colors hover:bg-surface-2 hover:text-text"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        ) : null}
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
  const t = useT();
  const client = useQueryClient();
  const { can } = useSession();
  const canWrite = can("tasks.write");
  const [active, setActive] = React.useState<Task | null>(null);
  const [createStatus, setCreateStatus] = React.useState<string | null>(null);

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
    onError: (error: any) => toast.error(error.message),
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
          {(data?.columns ?? []).map((column) => (
            <Column key={column.key} column={column} onAdd={setCreateStatus} canWrite={canWrite} />
          ))}
        </div>
        <DragOverlay>{active ? <TaskCard task={active} dragging /> : null}</DragOverlay>
      </DndContext>

      <TaskDialog
        open={Boolean(createStatus)}
        onOpenChange={(open) => !open && setCreateStatus(null)}
        defaults={{ status: createStatus ?? "todo", project_id: projectId ?? null }}
      />
    </>
  );
}
