import { fileURLToPath } from 'node:url';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, envField } from 'astro/config';

// `site` is read before astro:env exists, so it comes from the build environment (localhost in dev).
const SITE_URL = process.env.SITE_URL;

export default defineConfig({
  site: SITE_URL ?? 'http://localhost:4321',
  trailingSlash: 'always',
  integrations: [sitemap({ filter: (page) => !page.includes('/obrigado/') })],
  env: {
    schema: {
      PUBLIC_APP_URL: envField.string({ context: 'client', access: 'public', url: true }),
      PUBLIC_CONTACT_EMAIL: envField.string({ context: 'client', access: 'public' }),
      LEGAL_DRAFTS_ALLOWED: envField.boolean({
        context: 'server',
        access: 'public',
        default: false,
      }),
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
