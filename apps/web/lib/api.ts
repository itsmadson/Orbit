"use client";

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: { field: string; message: string }[];

  constructor(status: number, code: string, message: string, fields?: any[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const BASE = "/api/orbit";

function buildUrl(path: string, params?: Record<string, unknown>) {
  const url = new URL(`${BASE}${path.startsWith("/") ? path : `/${path}`}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, String(item)));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.pathname + url.search;
}

async function handle<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.code ?? "error",
      data?.message ?? response.statusText,
      data?.fields,
    );
  }
  return data as T;
}

export const api = {
  get<T>(path: string, params?: Record<string, unknown>) {
    return fetch(buildUrl(path, params), { credentials: "same-origin" }).then(handle<T>);
  },
  post<T>(path: string, body?: unknown, params?: Record<string, unknown>) {
    return fetch(buildUrl(path, params), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(handle<T>);
  },
  patch<T>(path: string, body?: unknown, params?: Record<string, unknown>) {
    return fetch(buildUrl(path, params), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(handle<T>);
  },
  delete<T>(path: string, params?: Record<string, unknown>) {
    return fetch(buildUrl(path, params), { method: "DELETE", credentials: "same-origin" }).then(
      handle<T>,
    );
  },
  upload<T>(path: string, file: File, params?: Record<string, unknown>) {
    const form = new FormData();
    form.append("file", file);
    return fetch(buildUrl(path, params), {
      method: "POST",
      credentials: "same-origin",
      body: form,
    }).then(handle<T>);
  },
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};
