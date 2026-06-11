const SERVICE_URL = import.meta.env.VITE_HERMES_SERVICE_URL ?? 'http://127.0.0.1:17891';

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${SERVICE_URL}${path}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${SERVICE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export function serviceWsUrl(): string {
  return `${SERVICE_URL.replace(/^http/, 'ws')}/ws`;
}
