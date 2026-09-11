"use client";

import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { api, type Page } from "@/lib/api";

/** Query one collection with pagination + filters kept in component state. */
export function useList<T>(
  path: string,
  params: Record<string, unknown> = {},
  options?: Partial<UseQueryOptions<Page<T>>>,
) {
  return useQuery<Page<T>>({
    queryKey: [path, params],
    queryFn: () => api.get<Page<T>>(path, params),
    ...(options as any),
  });
}

export function useItem<T>(
  path: string | null,
  params?: Record<string, unknown>,
  options?: Partial<UseQueryOptions<T>>,
) {
  return useQuery<T>({
    queryKey: [path, params ?? {}],
    queryFn: () => api.get<T>(path!, params),
    enabled: Boolean(path),
    ...(options as any),
  });
}

type MutationOptions = {
  invalidate?: string[];
  success?: string;
  onDone?: (data: any) => void;
};

export function useCreate<T, B = unknown>(path: string, options: MutationOptions = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: B) => api.post<T>(path, body),
    onSuccess: (data) => {
      (options.invalidate ?? [path]).forEach((key) =>
        client.invalidateQueries({ queryKey: [key] }),
      );
      if (options.success) toast.success(options.success);
      options.onDone?.(data);
    },
    onError: (error: any) => toast.error(error?.message ?? "Request failed"),
  });
}

export function useUpdate<T, B = unknown>(
  pathBuilder: (body: B) => string,
  options: MutationOptions = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path?: string; body: B }) =>
      api.patch<T>(path ?? pathBuilder(body), body),
    onSuccess: (data) => {
      (options.invalidate ?? []).forEach((key) => client.invalidateQueries({ queryKey: [key] }));
      if (options.success) toast.success(options.success);
      options.onDone?.(data);
    },
    onError: (error: any) => toast.error(error?.message ?? "Request failed"),
  });
}

export function useAction<T, B = unknown>(
  pathBuilder: (body: B) => string,
  options: MutationOptions = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: B) => api.post<T>(pathBuilder(body), body),
    onSuccess: (data) => {
      (options.invalidate ?? []).forEach((key) => client.invalidateQueries({ queryKey: [key] }));
      if (options.success) toast.success(options.success);
      options.onDone?.(data);
    },
    onError: (error: any) => toast.error(error?.message ?? "Request failed"),
  });
}

export function useRemove(pathBuilder: (id: string) => string, options: MutationOptions = {}) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(pathBuilder(id)),
    onSuccess: () => {
      (options.invalidate ?? []).forEach((key) => client.invalidateQueries({ queryKey: [key] }));
      if (options.success) toast.success(options.success);
      options.onDone?.(undefined);
    },
    onError: (error: any) => toast.error(error?.message ?? "Request failed"),
  });
}

/** Opens a create dialog when the URL carries ?create=1 (used by quick create). */
export function useCreateParam() {
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (params.get("create") === "1") {
      setOpen(true);
      router.replace(window.location.pathname, { scroll: false });
    }
  }, [params, router]);

  return [open, setOpen] as const;
}

export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
