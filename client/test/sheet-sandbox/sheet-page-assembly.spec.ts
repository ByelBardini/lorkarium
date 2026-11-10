import { describe, expect, it } from 'vitest';
import {
  expandSheetPage,
  inlineSheetAssets,
  SHEET_INCLUDE_MAX_DEPTH,
  SheetBuildError,
  sheetBuildErrorText,
  type SheetAssetData,
  type SheetSourceFile,
} from '@/sheet-sandbox/sheet-page-assembly';

function page(path: string, content: string): SheetSourceFile {
  return { path, content };
}

// index.html → n1.html → … → n<depth>.html, the last one saying "fundo".
function chainOf(depth: number): SheetSourceFile[] {
  const name = (level: number): string => (level === 0 ? 'index.html' : `n${level}.html`);
  return Array.from({ length: depth + 1 }, (_, level) =>
    page(name(level), level === depth ? 'fundo' : `<lk-include src="${name(level + 1)}">`),
  );
}

function buildErrorOf(run: () => unknown): SheetBuildError {
  try {
    run();
  } catch (error) {
    if (error instanceof SheetBuildError) return error;
    throw error;
  }
  throw new Error('expected a SheetBuildError; nothing was thrown');
}

describe('expandSheetPage', () => {
  it('swaps each include for its html file, with or without the closing tag', () => {
    const files = [
      page(
        'index.html',
        '<a></a><lk-include src="b.html"></lk-include>|<lk-include src=\'c.html\' />',
      ),
      page('b.html', 'B'),
      page('c.html', 'C'),
    ];
    expect(expandSheetPage(files)).toBe('<a></a>B|C');
  });

  it(`nests up to ${SHEET_INCLUDE_MAX_DEPTH} levels below index.html`, () =>
    expect(expandSheetPage(chainOf(SHEET_INCLUDE_MAX_DEPTH))).toBe('fundo'));

  it('refuses a ninth level, citing the file and the depth', () => {
    const error = buildErrorOf(() => expandSheetPage(chainOf(SHEET_INCLUDE_MAX_DEPTH + 1)));
    expect(error).toMatchObject({ problem: 'include_too_deep', path: 'n9.html', file: 'n8.html' });
    expect(error.message).toContain('depth 9; expected at most 8');
  });

  it('an include of a file that does not exist names it and the line it is on', () => {
    const files = [page('index.html', '<p>\n</p>\n<lk-include src="paginas/sumiu.html">')];
    const error = buildErrorOf(() => expandSheetPage(files));
    expect(error).toMatchObject({
      problem: 'missing_include',
      path: 'paginas/sumiu.html',
      line: 3,
    });
    expect(sheetBuildErrorText(error)).toBe(
      'o arquivo "paginas/sumiu.html" incluído não existe (index.html, linha 3)',
    );
  });

  it('an include of a css or js file is not a page', () =>
    expect(
      buildErrorOf(() =>
        expandSheetPage([page('index.html', '<lk-include src="a.js">'), page('a.js', 'x')]),
      ).problem,
    ).toBe('missing_include'));

  it('a cycle a → b → a is refused naming the cycle', () => {
    const files = [
      page('index.html', '<lk-include src="a.html">'),
      page('a.html', '<lk-include src="b.html">'),
      page('b.html', 'x\n<lk-include src="a.html">'),
    ];
    const error = buildErrorOf(() => expandSheetPage(files));
    expect(error).toMatchObject({ problem: 'include_cycle', file: 'b.html', line: 2 });
    expect(error.message).toContain('a.html → b.html → a.html');
  });

  it('templates without index.html are refused', () =>
    expect(buildErrorOf(() => expandSheetPage([page('a.html', '')])).problem).toBe('no_entry'));
});

describe('inlineSheetAssets', () => {
  const assets: ReadonlyMap<string, SheetAssetData> = new Map([
    ['fontes/cormorant.woff2', { type: 'font/woff2', base64: 'd09GMg==' }],
    ['img/brasao.png', { type: 'image/png', base64: 'iVBORw==' }],
  ]);

  it('turns a css url of an asset into its data url, quoted or not', () => {
    const css =
      '@font-face { src: url("asset:fontes/cormorant.woff2") } .a { background: url(asset:img/brasao.png) }';
    expect(inlineSheetAssets(css, 'estilo.css', assets)).toBe(
      '@font-face { src: url("data:font/woff2;base64,d09GMg==") } .a { background: url("data:image/png;base64,iVBORw==") }',
    );
  });

  it('turns an attribute of an asset into its data url', () =>
    expect(inlineSheetAssets('<img src="asset:img/brasao.png" alt="">', 'index.html', assets)).toBe(
      '<img src="data:image/png;base64,iVBORw==" alt="">',
    ));

  it('leaves the word asset alone outside a url or an attribute', () =>
    expect(inlineSheetAssets('<p>asset:img/brasao.png</p>', 'index.html', assets)).toBe(
      '<p>asset:img/brasao.png</p>',
    ));

  it('an asset the manifest does not list is refused naming it, the file and the line', () => {
    const css = '.a {}\n.b { background: url("asset:img/sumiu.png") }';
    const error = buildErrorOf(() => inlineSheetAssets(css, 'estilo.css', assets));
    expect(error).toMatchObject({ problem: 'missing_asset', path: 'img/sumiu.png', line: 2 });
    expect(sheetBuildErrorText(error)).toBe(
      'o asset "img/sumiu.png" não está no manifesto (estilo.css, linha 2)',
    );
  });
});
