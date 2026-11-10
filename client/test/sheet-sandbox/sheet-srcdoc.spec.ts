import { describe, expect, it } from 'vitest';
import { SHEET_BRIDGE_BOOTSTRAP } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import {
  authorScriptPositionOf,
  buildSheetSrcdoc,
  sameSheetSource,
  SHEET_BASE_STYLE,
  sheetContentSecurityPolicy,
  type SheetCodePosition,
  type SheetSource,
} from '@/sheet-sandbox/sheet-srcdoc';
import { SheetBuildError } from '@/sheet-sandbox/sheet-page-assembly';
import {
  browserScriptHashOf as browserHashOf,
  expectedScriptSrcOf,
  scriptSrcOf,
  scriptTextsOf,
  sheetPolicyOf as policyOf,
} from '../support/sheet-srcdoc-policy';

type Legacy = Readonly<{ html: string; css: string; js: string }>;

// One file of each kind, as a migrated template has them.
function sourceOf({ html, css, js }: Legacy): SheetSource {
  return {
    files: [
      { path: 'index.html', content: html },
      { path: 'style.css', content: css },
      { path: 'script.js', content: js },
    ],
  };
}

const TORMENTA_CODE: Legacy = {
  html: '<main id="tormenta-sheet">Lyra</main>',
  css: '#tormenta-sheet { color: gold; }',
  js: 'lorkarium.ready();',
};
const TORMENTA = sourceOf(TORMENTA_CODE);

// Two valid SHA-256 values in base64, for the policy alone.
const HASH_A = browserHashOf('a');
const HASH_B = browserHashOf('b');

function occurrencesOf(text: string, needle: RegExp): number {
  return text.match(needle)?.length ?? 0;
}

describe('buildSheetSrcdoc', () => {
  it('starts the document with the html5 doctype', () => {
    expect(buildSheetSrcdoc(TORMENTA).startsWith('<!doctype html>')).toBe(true);
  });

  it('puts the policy meta tag before any author content', () => {
    const srcdoc = buildSheetSrcdoc(TORMENTA);
    const policyAt = srcdoc.indexOf(`content="${policyOf(srcdoc)}"`);
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
    expect(srcdoc.indexOf('<script>\nlorkarium.ready();</script>')).toBeGreaterThan(
      srcdoc.indexOf('<main id="tormenta-sheet">Lyra</main>'),
    );
  });

  it('wraps the author css in a style element', () => {
    expect(buildSheetSrcdoc(TORMENTA)).toContain('<style>#tormenta-sheet { color: gold; }</style>');
  });

  it.each(['</script>', '</SCRIPT >', '</sCrIpT\n>'])(
    'a %j inside the author js cannot close its script element',
    (closing) => {
      const srcdoc = buildSheetSrcdoc(
        sourceOf({ ...TORMENTA_CODE, js: `const x = "${closing}<img src=x>";` }),
      );
      expect(occurrencesOf(srcdoc, /<\/script/gi)).toBe(2);
      expect(srcdoc).toContain('const x = "<\\/');
    },
  );

  it('an html comment opener in the author js cannot swallow the closing tag', () => {
    const srcdoc = buildSheetSrcdoc(
      sourceOf({ ...TORMENTA_CODE, js: 'const x = "<!--<script>";' }),
    );
    expect(srcdoc).not.toContain('<!--');
    expect(srcdoc).toContain('const x = "<\\!--<script>";');
  });

  it('a </style> inside the author css cannot close its style element', () => {
    const srcdoc = buildSheetSrcdoc(
      sourceOf({ ...TORMENTA_CODE, css: 'a{}</STYLE><script>alert(1)</script>' }),
    );
    expect(occurrencesOf(srcdoc, /<\/style/gi)).toBe(2);
    expect(srcdoc).toContain('<style>a{}<\\/STYLE><script>alert(1)</script></style>');
  });

  it('keeps the author html as written', () => {
    const html = '<form><input name="forca" value="16"></form>';
    expect(buildSheetSrcdoc(sourceOf({ ...TORMENTA_CODE, html }))).toContain(
      `<body>${html}<script>`,
    );
  });
});

describe('the script hashes of a sheet frame', () => {
  it('pins the policy: scripts only by their hash, no inline handler, no network', () => {
    expect(sheetContentSecurityPolicy([HASH_A, HASH_B])).toBe(
      `default-src 'none'; script-src 'sha256-${HASH_A}' 'sha256-${HASH_B}'; script-src-attr 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'`,
    );
  });

  it('lists exactly one hash per script of the srcdoc, and no nonce, inline or strict-dynamic', () => {
    const srcdoc = buildSheetSrcdoc(TORMENTA);
    const scriptSrc = scriptSrcOf(policyOf(srcdoc));
    expect(scriptTextsOf(srcdoc)).toHaveLength(2);
    expect(scriptSrc).toBe(expectedScriptSrcOf(srcdoc));
    expect(scriptSrc).not.toMatch(/'nonce-|'unsafe-inline'|'strict-dynamic'/);
  });

  it('the hash of the bootstrap is the hash of its text as embedded', () => {
    const scriptSrc = scriptSrcOf(policyOf(buildSheetSrcdoc(TORMENTA)));
    expect(scriptSrc.split(' ')[1]).toBe(`'sha256-${browserHashOf(SHEET_BRIDGE_BOOTSTRAP)}'`);
  });

  it('no script element of the srcdoc carries an attribute', () => {
    const srcdoc = buildSheetSrcdoc(TORMENTA);
    expect(occurrencesOf(srcdoc, /<script[\s>]/g)).toBe(2);
    expect(occurrencesOf(srcdoc, /<script>/g)).toBe(2);
    expect(srcdoc).not.toContain('nonce');
  });

  it('hashes the author js with the escape of a closing tag, as the browser reads it', () => {
    const srcdoc = buildSheetSrcdoc(sourceOf({ ...TORMENTA_CODE, js: 'const x = "</script>";' }));
    expect(scriptSrcOf(policyOf(srcdoc))).toContain(
      `'sha256-${browserHashOf('\nconst x = "<\\/script>";')}'`,
    );
  });

  it('a js file with CR LF and lone CR is embedded and hashed with LF, as the parser leaves it', () => {
    const srcdoc = buildSheetSrcdoc(
      sourceOf({ ...TORMENTA_CODE, js: 'const a = 1;\r\nconst b = 2;\rlorkarium.ready();\r\n' }),
    );
    const parsed = '\nconst a = 1;\nconst b = 2;\nlorkarium.ready();\n';
    expect(srcdoc).toContain(`<script>${parsed}</script>`);
    expect(srcdoc).not.toContain('\r');
    expect(scriptSrcOf(policyOf(srcdoc))).toContain(`'sha256-${browserHashOf(parsed)}'`);
  });

  it('a U+0000 in the js is embedded and hashed as U+FFFD, as the parser leaves it', () => {
    const srcdoc = buildSheetSrcdoc(sourceOf({ ...TORMENTA_CODE, js: 'const nul = "\u0000";' }));
    const parsed = '\nconst nul = "\uFFFD";';
    expect(srcdoc).toContain(`<script>${parsed}</script>`);
    expect(scriptSrcOf(policyOf(srcdoc))).toContain(`'sha256-${browserHashOf(parsed)}'`);
  });

  it('two templates with different js get different hashes', () => {
    const first = scriptSrcOf(policyOf(buildSheetSrcdoc(TORMENTA)));
    const other = sourceOf({ ...TORMENTA_CODE, js: 'lorkarium.ready(); // outra' });
    const second = scriptSrcOf(policyOf(buildSheetSrcdoc(other)));
    expect(first.split(' ')[1]).toBe(second.split(' ')[1]);
    expect(first.split(' ')[2]).not.toBe(second.split(' ')[2]);
  });

  it('no hash at all means no script', () =>
    expect(scriptSrcOf(sheetContentSecurityPolicy([]))).toBe("script-src 'none'"));

  it.each(['', 'abc', `${HASH_A.slice(0, -1)}'`, `${HASH_A} 'unsafe-inline'`, `${HASH_A}x`])(
    'a hash %j that is not the base64 of a SHA-256 is refused with a RangeError citing it',
    (hash) => {
      expect(() => sheetContentSecurityPolicy([hash])).toThrow(
        new RangeError(
          `sheet script hash must be 44 characters of base64 (a SHA-256); received ${JSON.stringify(hash)}`,
        ),
      );
    },
  );
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
  const source = sourceOf({
    html: '<main>\n  <button onclick="nada()">x</button>\n</main>',
    css: '.a {\n  color: red;\n}',
    js: 'const pv = 1;\n\n  falhou(pv);\n',
  });
  const srcdoc = buildSheetSrcdoc(source);

  it('turns a srcdoc line of the author js into the line and column of the JS file', () => {
    expect(authorScriptPositionOf(source, [srcdocPositionOf(srcdoc, 'falhou(pv)')])).toEqual({
      path: 'script.js',
      line: 3,
      column: 3,
    });
  });

  it('the first line of the js starts at column 1 of its own srcdoc line', () => {
    expect(authorScriptPositionOf(source, [srcdocPositionOf(srcdoc, 'const pv')])).toEqual({
      path: 'script.js',
      line: 1,
      column: 1,
    });
  });

  it('the srcdoc line of the script tag, before the js, is the html, not the js', () => {
    const start = srcdocPositionOf(srcdoc, 'const pv');
    const inHtml = { line: start.line - 1, column: 5 };
    expect(authorScriptPositionOf(source, [inHtml])).toBeNull();
  });

  it('a js file with CR LF counts its lines as the browser does, after the parser', () => {
    const crlf = sourceOf({ ...TORMENTA_CODE, js: 'const a = 1;\r\n\r\n  falhou(a);\r\n' });
    const built = buildSheetSrcdoc(crlf);
    expect(authorScriptPositionOf(crlf, [srcdocPositionOf(built, 'falhou(a)')])).toEqual({
      path: 'script.js',
      line: 3,
      column: 3,
    });
  });

  it('a lone CR in the js is a line break too, as the browser counts it', () => {
    const cr = sourceOf({ ...TORMENTA_CODE, js: 'const a = 1;\rfalhou(a);' });
    const built = buildSheetSrcdoc(cr);
    expect(authorScriptPositionOf(cr, [srcdocPositionOf(built, 'falhou(a)')])).toEqual({
      path: 'script.js',
      line: 2,
      column: 1,
    });
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
    ).toEqual({ path: 'script.js', line: 3, column: 3 });
  });

  it('a line past the end of the js is not the author js', () => {
    const last = srcdocPositionOf(srcdoc, 'falhou(pv)');
    expect(authorScriptPositionOf(source, [{ line: last.line + 5, column: 1 }])).toBeNull();
    expect(authorScriptPositionOf(source, [])).toBeNull();
  });
});

describe('a srcdoc built from many files', () => {
  const LORK: SheetSource = {
    files: [
      {
        path: 'index.html',
        content: '<main>\n<lk-include src="paginas/perfil.html"></lk-include>\n</main>',
      },
      { path: 'b.css', content: '.b{}' },
      {
        path: 'paginas/perfil.html',
        content: '<h2>Perfil</h2>\n<lk-include src="paginas/barras.html" />',
      },
      { path: 'a.css', content: '.a{}' },
      { path: 'scripts/b.js', content: 'const b = 1;\nfalhouB();' },
      { path: 'paginas/barras.html', content: '<p id="pv">PV</p>' },
      { path: 'scripts/a.js', content: 'falhouA();\nlorkarium.ready();' },
    ],
  };
  const srcdoc = buildSheetSrcdoc(LORK);

  it('swaps each <lk-include> for the html file, includes inside includes too', () => {
    expect(srcdoc).toContain('<body><main>\n<h2>Perfil</h2>\n<p id="pv">PV</p>\n</main>');
    expect(srcdoc).not.toContain('lk-include');
  });

  it('puts every css file in its own style element, in the order of the files', () => {
    expect(srcdoc.indexOf('<style>.b{}</style>')).toBeGreaterThan(0);
    expect(srcdoc.indexOf('<style>.b{}</style>')).toBeLessThan(
      srcdoc.indexOf('<style>.a{}</style>'),
    );
    expect(srcdoc.indexOf('<style>.a{}</style>')).toBeLessThan(srcdoc.indexOf('<body>'));
  });

  it('runs every js file in a script of its own, in the order of the files', () => {
    expect(srcdoc).toContain('<script>\nconst b = 1;\nfalhouB();</script><script>\nfalhouA();');
    expect(occurrencesOf(srcdoc, /<script>/g)).toBe(3);
    expect(scriptSrcOf(policyOf(srcdoc)).split(' ')).toHaveLength(4);
    expect(srcdoc.indexOf('falhouA()')).toBeGreaterThan(srcdoc.indexOf('<p id="pv">'));
  });

  it('the line of an error is the js file and its own line, file by file', () => {
    expect(authorScriptPositionOf(LORK, [srcdocPositionOf(srcdoc, 'falhouB()')])).toEqual({
      path: 'scripts/b.js',
      line: 2,
      column: 1,
    });
    expect(authorScriptPositionOf(LORK, [srcdocPositionOf(srcdoc, 'ready()')])).toEqual({
      path: 'scripts/a.js',
      line: 2,
      column: 11,
    });
  });

  it('a position inside an included page is not a js file', () => {
    expect(authorScriptPositionOf(LORK, [srcdocPositionOf(srcdoc, 'Perfil')])).toBeNull();
  });

  it('a srcdoc of files that do not make a page throws a SheetBuildError naming the path', () => {
    const broken: SheetSource = {
      files: [{ path: 'index.html', content: '<p>\n<lk-include src="sumiu.html">' }],
    };
    expect(() => buildSheetSrcdoc(broken)).toThrow(SheetBuildError);
    expect(() => buildSheetSrcdoc(broken)).toThrow(
      'include "sumiu.html" not found (index.html, line 2)',
    );
    expect(authorScriptPositionOf(broken, [{ line: 1, column: 1 }])).toBeNull();
  });
});

describe('sameSheetSource', () => {
  it('the same files in another order are another page', () => {
    const files = TORMENTA.files;
    expect(sameSheetSource(TORMENTA, { files: [...files] })).toBe(true);
    expect(sameSheetSource(TORMENTA, { files: [...files].reverse() })).toBe(false);
    expect(sameSheetSource(TORMENTA, sourceOf({ ...TORMENTA_CODE, js: 'x' }))).toBe(false);
  });
});

describe('a srcdoc with the assets of the template', () => {
  const assets = new Map([
    ['fontes/x.woff2', { type: 'font/woff2', base64: 'd09GMg==' }],
    ['img/brasao.png', { type: 'image/png', base64: 'iVBORw==' }],
  ]);
  const files = [
    { path: 'index.html', content: '<img src="asset:img/brasao.png" alt="">' },
    { path: 'estilo.css', content: '@font-face { src: url("asset:fontes/x.woff2") }' },
  ];

  it('embeds each asset as a data url in the css and the html, and keeps the policy offline', () => {
    const srcdoc = buildSheetSrcdoc({ files, assets });
    expect(srcdoc).toContain('url("data:font/woff2;base64,d09GMg==")');
    expect(srcdoc).toContain('<img src="data:image/png;base64,iVBORw==" alt="">');
    expect(srcdoc).not.toContain('asset:');
    expect(policyOf(srcdoc)).toContain("default-src 'none'");
  });

  it('an asset the manifest does not list is a SheetBuildError naming it', () =>
    expect(() => buildSheetSrcdoc({ files })).toThrow(
      'asset "fontes/x.woff2" not declared (estilo.css, line 1)',
    ));

  it('the line of an error does not move with the size of the assets', () => {
    const scripted = { files: [...files, { path: 'a.js', content: 'falhou();' }], assets };
    const srcdoc = buildSheetSrcdoc(scripted);
    expect(authorScriptPositionOf(scripted, [srcdocPositionOf(srcdoc, 'falhou()')])).toEqual({
      path: 'a.js',
      line: 1,
      column: 1,
    });
  });
});
