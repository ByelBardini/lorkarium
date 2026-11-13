import {
  test as base,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';

/** A window wide enough that the board right of the centre (columns 13 and 14 of the default
 *  scene) stays clear of the side panel and its rail, which float over the board: at 1280 × 720
 *  "Enquadrar cena" puts column 14 under the panel. For specs that read or click the canvas there.
 *
 *  Example: `const bia = await newPlayerPage(WIDE_ROOM)` */
export const WIDE_ROOM: BrowserContextOptions = { viewport: { width: 1600, height: 900 } };

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
