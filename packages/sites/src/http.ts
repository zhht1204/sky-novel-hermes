export interface FetchTextOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export async function fetchText(url: string, options: FetchTextOptions = {}): Promise<{ text: string; status: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'SkyNovelHermes/0.1 (+local desktop app)',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...options.headers,
      },
      signal: controller.signal,
    });
    return { text: await response.text(), status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

export function absolutizeUrl(baseUrl: string, href: string): string {
  return new URL(href, baseUrl).toString();
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
