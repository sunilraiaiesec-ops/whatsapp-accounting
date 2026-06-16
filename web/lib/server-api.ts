import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getApiUrl, SESSION_COOKIE } from "./config";

async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  if (!session) {
    redirect("/login");
  }

  const url = `${getApiUrl()}/api/v1/${path.replace(/^\//, "")}`;
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Cookie: `session=${session}`,
    },
    cache: "no-store",
  });
}

export async function serverApi<T>(path: string): Promise<T> {
  const response = await backendFetch(path);
  if (response.status === 401) {
    redirect("/login");
  }
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${path}`);
  }
  return response.json() as Promise<T>;
}

export async function serverApiPatch<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await backendFetch(path, {
    method: "PATCH",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401) {
    redirect("/login");
  }
  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${path}`);
  }
  return response.json() as Promise<T>;
}
