import "server-only";

// The *only* place a request to the NestJS API is actually made — every
// Server Component/Action goes through this, so auth-header handling and
// error shaping aren't duplicated per call site. Server-to-server only
// (see the admin UI design plan's architecture section for why): the API
// has zero CORS configured, and this file is the reason it never needs any
// — nothing in the browser ever calls it directly.
const API_URL = process.env.API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : `Request failed with status ${status}`;
    super(message);
    this.status = status;
    this.body = body;
  }
}

interface ApiFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
  cache?: RequestCache;
  revalidate?: number | false;
  tags?: string[];
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: options.cache,
    next:
      options.revalidate !== undefined || options.tags
        ? { revalidate: options.revalidate, tags: options.tags }
        : undefined,
  });

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, data);
  }
  return data as T;
}

// For screens (chiefly the dashboard) that call several permission-gated
// endpoints at once and want to degrade a single missing grant quietly —
// e.g. an officer without ledger:view simply doesn't see the financial
// cards, rather than the whole page failing — instead of every call site
// hand-rolling the same try/catch. Genuine errors (5xx, network failures)
// still propagate; only an explicit permission denial is swallowed.
export async function apiFetchOrNull<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T | null> {
  try {
    return await apiFetch<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      return null;
    }
    throw error;
  }
}
