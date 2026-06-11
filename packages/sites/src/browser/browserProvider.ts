import type { Browser } from 'playwright-core';

export interface BrowserLaunchOptions {
  headless?: boolean;
  humanize?: boolean;
  proxy?: string;
  locale?: string;
  timezone?: string;
}

export interface BrowserProvider {
  launch(options?: BrowserLaunchOptions): Promise<Browser>;
}

export class CloakBrowserProvider implements BrowserProvider {
  async launch(options: BrowserLaunchOptions = {}): Promise<Browser> {
    const { launch } = await import('cloakbrowser');
    return launch({
      headless: options.headless ?? process.env.CLOAKBROWSER_HEADLESS !== 'false',
      humanize: options.humanize ?? process.env.CLOAKBROWSER_HUMANIZE === 'true',
      proxy: options.proxy,
      locale: options.locale,
      timezone: options.timezone,
    });
  }
}
