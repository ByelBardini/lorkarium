import { describe, expect, it } from 'vitest';
import { SHEET_BRIDGE_BOOTSTRAP } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import {
  authorScriptPositionOf,
  buildSheetSrcdoc,
  SHEET_BASE_STYLE,
  SHEET_CONTENT_SECURITY_POLICY,
  type SheetCodePosition,
  type SheetSource,
} from '@/sheet-sandbox/sheet-srcdoc';

const TORMENTA: SheetSource = {
  html: '<main id="tormenta-sheet">Lyra</main>',
  css: '#tormenta-sheet { color: gold; }',
  js: 'lorkarium.ready();',
};

function occurrencesOf(text: string, needle: RegExp): number {
  return text.match(needle)?.length ?? 0;
}

describe('buildSheetSrcdoc', () => {
  it('starts the document with the html5 doctype', () => {
    expect(buildSheetSrcdoc(TORMENTA).startsWith('<!doctype html>')).toBe(true);
  });

  it('pins the sandbox content security policy', () => {
    expect(SHEET_CONTENT_SECURITY_POLICY).toBe(
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'",
    );
  });

  it('puts the policy meta tag before any author content', () => {
    const srcdoc = buildSheetSrcdoc(TORMENTA);
    const policy = `<meta http-equiv="Content-Security-Policy" content="${SHEET_CONTENT_SECURITY_POLICY}">`;
    const policyAt = srcdoc.indexOf(policy);
    expect(policyAt).toBeGreaterThan(0);
    expect(policyAt).toBeLessThan(srcdoc.indexOf('#tormenta-sheet {'));
    expect(policyAt).toBeLessThan(srcdoc.indexOf('<main id="tormenta-sheet">'));
  });

  it('places no tag before the policy other than the charset', () => {
    const head = buildSheetSrcdoc(TORMENTA).split('<meta http-equiv="Content-Security-Policy"')[0];
    expect(head).toBe('<!doctype html><html><head><meta charset="utf-8">');
  });

  it('runs the bridge bootstrap before the author html and js', () => {
    const srcdoc = buildSheetSrcdoc(TORMENTA);
    const bootstrapAt = srcdoc.indexOf(`<script>${SHEET_BRIDGE_BOOTSTRAP}</script>`);
    expect(bootstrapAt).toBeGreaterThan(0);
    expect(bootstrapAt).toBeLessThan(srcdoc.indexOf('<main id="tormenta-sheet">'));
    expect(bootstrapAt).toBeLessThan(srcdoc.indexOf('lorkarium.ready();'));
  });

  it('runs the author js after the author html, so the markup already exists', () => {
    const srcdoc = buildSheetSrcdoc(TORMENTA);
    expect(srcdoc.indexOf('<script>lorkarium.ready();</script>')).toBeGreaterThan(
      srcdoc.indexOf('<main id="tormenta-sheet">Lyra</main>'),
    );
  });

  it('wraps the author css in a style element', () => {
    expect(buildSheetSrcdoc(TORMENTA)).toContain('<style>#tormenta-sheet { color: gold; }</style>');
  });

  it.each(['</script>', '</SCRIPT >', '</sCrIpT\n>'])(
    'a %j inside the author js cannot close its script element',
    (closing) => {
      const srcdoc = buildSheetSrcdoc({ ...TORMENTA, js: `const x = "${closing}<img src=x>";` });
      expect(occurrencesOf(srcdoc, /<\/script/gi)).toBe(2);
      expect(srcdoc).toContain('const x = "<\\/');
    },
  );

  it('an html comment opener in the author js cannot swallow the closing tag', () => {
    const srcdoc = buildSheetSrcdoc({ ...TORMENTA, js: 'const x = "<!--<script>";' });
    expect(srcdoc).not.toContain('<!--');
    expect(srcdoc).toContain('const x = "<\\!--<script>";');
  });

  it('a </style> inside the author css cannot close its style element', () => {
    const srcdoc = buildSheetSrcdoc({ ...TORMENTA, css: 'a{}</STYLE><script>alert(1)</script>' });
    expect(occurrencesOf(srcdoc, /<\/style/gi)).toBe(2);
    expect(srcdoc).toContain('<style>a{}<\\/STYLE><script>alert(1)</script></style>');
  });

  it('keeps the author html as written', () => {
    const html = '<form><input name="forca" value="16"></form>';
    expect(buildSheetSrcdoc({ ...TORMENTA, html })).toContain(`<body>${html}<script>`);
  });
});

describe('the base style of the sheet page', () => {
  it('gives the page the dark background and light text of the app', () => {
    expect(SHEET_BASE_STYLE).toContain('background:#101216');
    expect(SHEET_BASE_STYLE).toContain('color:#eae5da');
    expect(SHEET_BASE_STYLE).toContain('color-scheme:dark');
  });

  it('comes after the policy and before the author css, so the author wins', () => {
    const srcdoc = buildSheetSrcdoc(TORMENTA);
    const baseAt = srcdoc.indexOf(`<style>${SHEET_BASE_STYLE}</style>`);
    expect(baseAt).toBeGreaterThan(srcdoc.indexOf('Content-Security-Policy'));
    expect(baseAt).toBeLessThan(srcdoc.indexOf('<style>#tormenta-sheet'));
  });
});

// Where the browser would place `needle` of the srcdoc: 1-based line and column.
function srcdocPositionOf(srcdoc: string, needle: string): SheetCodePosition {
  const before = srcdoc.slice(0, srcdoc.indexOf(needle)).split('\n');
  return { line: before.length, column: (before.at(-1) ?? '').length + 1 };
}

describe('authorScriptPositionOf', () => {
  const source: SheetSource = {
    html: '<main>\n  <button onclick="nada()">x</button>\n</main>',
    css: '.a {\n  color: red;\n}',
    js: 'const pv = 1;\n\n  falhou(pv);\n',
  };
  const srcdoc = buildSheetSrcdoc(source);

  it('turns a srcdoc line of the author js into the line and column of the JS file', () => {
    expect(authorScriptPositionOf(source, [srcdocPositionOf(srcdoc, 'falhou(pv)')])).toEqual({
      line: 3,
      column: 3,
    });
  });

  it('the first line of the js discounts what comes before it on that srcdoc line', () => {
    expect(authorScriptPositionOf(source, [srcdocPositionOf(srcdoc, 'const pv')])).toEqual({
      line: 1,
      column: 1,
    });
  });

  it('on the srcdoc line where the js starts, a column before it is the html, not the js', () => {
    const start = srcdocPositionOf(srcdoc, 'const pv');
    const inHtml = { line: start.line, column: start.column - 3 };
    expect(authorScriptPositionOf(source, [inHtml])).toBeNull();
  });

  it('a position in the bootstrap or in an inline handler of the html is not the author js', () => {
    const inBootstrap = srcdocPositionOf(srcdoc, 'use strict');
    const inHandler = srcdocPositionOf(srcdoc, 'nada()');
    expect(authorScriptPositionOf(source, [inBootstrap, inHandler])).toBeNull();
  });

  it('skips the positions outside the js and takes the first inside', () => {
    const inBootstrap = srcdocPositionOf(srcdoc, 'use strict');
    expect(
      authorScriptPositionOf(source, [inBootstrap, srcdocPositionOf(srcdoc, 'falhou(pv)')]),
    ).toEqual({ line: 3, column: 3 });
  });

  it('a line past the end of the js is not the author js', () => {
    const last = srcdocPositionOf(srcdoc, 'falhou(pv)');
    expect(authorScriptPositionOf(source, [{ line: last.line + 5, column: 1 }])).toBeNull();
    expect(authorScriptPositionOf(source, [])).toBeNull();
  });
});
