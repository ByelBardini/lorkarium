import {
  test as base,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';

type PlayerPages = Readonly<{ newPlayerPage: (options?: BrowserContextOptions) => Promise<Page> }>;

/** `test` with `newPlayerPage`: one more person at the table, in a browser context of their own
 *  (`options` such as `reducedMotion: 'reduce'` apply to that context only).
 *  Playwright never closes a context made by `browser.newContext()`; left open, every page of the
 *  earlier specs keeps its socket and its PixiJS ticking and slows the next ones on one worker.
 *
 *  Example: `test('…', async ({ newPlayerPage }) => { const bia = await newPlayerPage(); })` */
export const test = base.extend<PlayerPages>({
  newPlayerPage: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (options) => {
      const context = await browser.newContext(options);
      contexts.push(context);
      return context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});
