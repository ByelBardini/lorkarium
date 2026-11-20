import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField } from 'astro/config';
import {
  contentPageOf,
  hiddenPathsOf,
  isIndexablePath,
  sitemapEntryOf,
} from './src/lib/sitemap-entry.ts';

// `site` is read before astro:env exists, so it comes from the build environment (localhost in dev).
const SITE_URL = process.env.SITE_URL;

// `getCollection` does not exist in the config: the sitemap reads the frontmatter straight from disk.
const CONTENT_DIR = new URL('./src/content/', import.meta.url);
const contentPages = readdirSync(CONTENT_DIR, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.md'))
  .map((file) => file.replaceAll('\\', '/'))
  .map((file) => contentPageOf(file, readFileSync(new URL(file, CONTENT_DIR), 'utf8')));
const hiddenPaths = hiddenPathsOf(contentPages);
const updatedAtByPath = new Map(contentPages.map((page) => [page.path, page.updatedAt]));

export default defineConfig({
  site: SITE_URL ?? 'http://localhost:4321',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      filter: (page) => isIndexablePath(new URL(page).pathname, hiddenPaths),
      serialize: (item) => ({ ...item, ...sitemapEntryOf(item, updatedAtByPath) }),
    }),
  ],
  env: {
    schema: {
      PUBLIC_APP_URL: envField.string({ context: 'client', access: 'public', url: true }),
      PUBLIC_CONTACT_EMAIL: envField.string({ context: 'client', access: 'public' }),
      LEGAL_DRAFTS_ALLOWED: envField.boolean({
        context: 'server',
        access: 'public',
        default: false,
      }),
      // Same rule for the recurso guides: drafts render (noindex) only with true.
      GUIDE_DRAFTS_ALLOWED: envField.boolean({
        context: 'server',
        access: 'public',
        default: false,
      }),
      // Who sells (Decreto 7.962/2013, art. 2º). `server` on purpose: the raw CPF never reaches the
      // client bundle; the build writes only its mask into the HTML (src/lib/supplier-identity.ts).
      LEGAL_SUPPLIER_NAME: envField.string({ context: 'server', access: 'public' }),
      LEGAL_SUPPLIER_CPF: envField.string({ context: 'server', access: 'secret' }),
    },
  },
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "connect-src 'self' https://api.github.com",
        "img-src 'self' data:",
        // Vite inlines the smallest fontsource subsets as data: URLs.
        "font-src 'self' data:",
        "base-uri 'self'",
        "form-action 'self'",
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  },
});
