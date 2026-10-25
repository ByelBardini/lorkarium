import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { JSDOM } from 'jsdom';

// Same origin as SITE_URL in vitest.config.ts: the container does not read `site` from astro.config.
const TEST_SITE_URL = 'https://lorkarium.test';

type AstroComponent = Parameters<AstroContainer['renderToString']>[0];

export interface RenderOptions {
  props?: Record<string, unknown>;
  slots?: Record<string, string>;
  /** The page path, for components that read `Astro.url`. */
  path?: string;
}

/**
 * Renders an `.astro` component through the Container API and parses it into a DOM.
 * Example: `const doc = await renderAstro(SiteHeader); doc.querySelector('a[href="/obrigado/"]')`
 */
export async function renderAstro(
  component: AstroComponent,
  options: RenderOptions = {},
): Promise<Document> {
  const html = await renderAstroHtml(component, options);
  return new JSDOM(html).window.document;
}

/**
 * The raw HTML of a component, for markup injected into a jsdom test document.
 * Example: `document.body.innerHTML = await renderAstroHtml(DownloadCta)`
 */
export async function renderAstroHtml(
  component: AstroComponent,
  { props = {}, slots = {}, path = '/' }: RenderOptions = {},
): Promise<string> {
  const container = await AstroContainer.create({ astroConfig: { site: TEST_SITE_URL } });
  return container.renderToString(component, {
    props,
    slots,
    request: new Request(new URL(path, TEST_SITE_URL)),
  });
}
