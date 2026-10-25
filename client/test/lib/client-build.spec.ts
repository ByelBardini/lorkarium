import { describe, expect, it } from 'vitest';
import { buildFingerprintOf } from '@/lib/client-build';

function pageOf(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('buildFingerprintOf', () => {
  it('joins the hashed entry script and stylesheets of a build, sorted', () => {
    const page = pageOf(`<head>
      <script type="module" crossorigin src="/assets/index-Dq9.js"></script>
      <link rel="stylesheet" crossorigin href="/assets/index-B1x.css">
    </head>`);
    expect(buildFingerprintOf(page)).toBe('/assets/index-B1x.css /assets/index-Dq9.js');
  });

  it('leaves out the favicon, the preloads and scripts outside /assets/', () => {
    const page = pageOf(`<head>
      <link rel="icon" href="/favicon.svg">
      <link rel="modulepreload" href="/assets/vendor-Aa1.js">
      <script type="module" src="/src/main.tsx"></script>
      <script type="module" src="/assets/index-Dq9.js"></script>
    </head>`);
    expect(buildFingerprintOf(page)).toBe('/assets/index-Dq9.js');
  });

  it('is empty on the dev server page, which has no build', () => {
    const page = pageOf('<head><script type="module" src="/src/main.tsx"></script></head>');
    expect(buildFingerprintOf(page)).toBe('');
  });

  it('changes when the entry hash changes', () => {
    const before = pageOf('<script type="module" src="/assets/index-Dq9.js"></script>');
    const after = pageOf('<script type="module" src="/assets/index-Zz7.js"></script>');
    expect(buildFingerprintOf(after)).not.toBe(buildFingerprintOf(before));
  });
});
