import type { NovelSiteAdapter } from '@sky-novel-hermes/shared';
import { Quanben5Big5SiteAdapter } from './quanben5-big5/site.js';

const sites: NovelSiteAdapter[] = [new Quanben5Big5SiteAdapter()];

export function getSites(): NovelSiteAdapter[] {
  return sites;
}

export function getSite(siteId: string): NovelSiteAdapter {
  const site = sites.find((candidate) => candidate.id === siteId);
  if (!site) {
    throw new Error(`Unknown site: ${siteId}`);
  }
  return site;
}
