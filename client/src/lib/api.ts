/** Thin fetch wrapper for the GlowGrace API: JSON in/out, bearer token, typed errors. */

export const TOKEN_KEY = "gg_auth_token";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: any,
  ) {
    super(message);
  }
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    throw new ApiError(0, "You appear to be offline. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.message || `Request failed (${res.status})`, data?.details);
  }
  return data as T;
}
