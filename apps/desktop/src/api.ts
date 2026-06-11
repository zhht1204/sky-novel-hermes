const SERVICE_URL = import.meta.env.VITE_HERMES_SERVICE_URL ?? 'http://127.0.0.1:17891';

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${SERVICE_URL}${path}`);
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${SERVICE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return response.json() as Promise<T>;
}

export function serviceWsUrl(): string {
  return `${SERVICE_URL.replace(/^http/, 'ws')}/ws`;
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    // Fall through to the raw body below.
  }
  return text || `${response.status} ${response.statusText}`;
}
