const SERVICE_URL = import.meta.env.VITE_HERMES_SERVICE_URL ?? 'http://127.0.0.1:17891';

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly data: unknown) {
    super(message);
  }
}

export function serviceUrl(): string {
  return SERVICE_URL;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetchJson(`${SERVICE_URL}${path}`);
  if (!response.ok) throw await readApiError(response);
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetchJson(`${SERVICE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await readApiError(response);
  return response.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetchJson(`${SERVICE_URL}${path}`, { method: 'DELETE' });
  if (!response.ok) throw await readApiError(response);
  return response.json() as Promise<T>;
}

export function serviceWsUrl(): string {
  return `${SERVICE_URL.replace(/^http/, 'ws')}/ws`;
}

async function fetchJson(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw new Error(`无法连接到本地服务 ${SERVICE_URL}。请先启动 Node service，或检查 VITE_HERMES_SERVICE_URL。${error instanceof Error ? ` (${error.message})` : ''}`);
  }
}

async function readApiError(response: Response): Promise<ApiError> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    return new ApiError(typeof parsed.error === 'string' ? parsed.error : `${response.status} ${response.statusText}`, response.status, parsed);
  } catch {
    return new ApiError(text || `${response.status} ${response.statusText}`, response.status, text);
  }
}
