const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000";

interface RequestOptions extends RequestInit {
  userId?: string;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestOptions,
): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set("Content-Type", "application/json");
  if (options?.userId) {
    headers.set("x-user-id", options.userId);
  }

  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  const payload = (await response.json()) as T | { error: string };
  if (!response.ok) {
    const error =
      typeof payload === "object" && payload && "error" in payload
        ? payload.error
        : "Request failed";
    throw new Error(error);
  }

  return payload as T;
}
