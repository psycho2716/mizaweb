import { env } from "@/lib/env";

export function backendUrl(path: string): string {
  const base = env.NEXT_PUBLIC_BACKEND_URL.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export async function backendFetchJson<T>(
  path: string,
  init?: RequestInit & { accessToken?: string | null }
): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = init?.accessToken;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type") && init?.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(backendUrl(path), {
    ...init,
    headers,
    credentials: "include",
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`Invalid JSON from backend (${res.status})`);
    }
  }

  if (!res.ok) {
    const errMsg =
      data && typeof data === "object" && data !== null && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new Error(errMsg);
  }

  return data as T;
}
