import type { SiteSummary } from '../types.js';

export function matchSiteByUrl(sites: SiteSummary[], url: string): SiteSummary | undefined {
  try {
    const target = new URL(url);
    return sites.find((site) => {
      const base = new URL(site.baseUrl);
      return target.protocol === base.protocol && target.hostname === base.hostname;
    });
  } catch {
    return undefined;
  }
}

export function normalizeLocalUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.hash.startsWith('#hermes-copy-')) url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

export function shortUrl(value: string): string {
  try {
    const url = new URL(value);
    const lastSegment = url.pathname.split('/').filter(Boolean).at(-1);
    return lastSegment ? `${url.hostname}/${lastSegment}` : url.hostname;
  } catch {
    return value;
  }
}

export function formatToken(value: number | undefined): string {
  return value === undefined ? '-' : String(value);
}

export function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

const STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '进行中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
