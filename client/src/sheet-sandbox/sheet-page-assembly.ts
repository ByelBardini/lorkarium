// Pure and relative on purpose: the e2e imports the srcdoc builder (and so this file) from
// outside the client (docs/context/sheets/sandbox.md).

/** One file of the author's template. */
export interface SheetSourceFile {
  readonly path: string;
  readonly content: string;
}

/** The bytes of one template asset, already as base64, and the type they were stored with. */
export interface SheetAssetData {
  readonly type: string;
  readonly base64: string;
}

/** The page every template shows; the includes start from it. */
export const SHEET_ENTRY_PAGE = 'index.html';
/** How deep `<lk-include>` may nest below the entry page. */
export const SHEET_INCLUDE_MAX_DEPTH = 8;

export type SheetBuildProblem =
  'no_entry' | 'missing_include' | 'include_cycle' | 'include_too_deep' | 'missing_asset';

/** The template cannot become a page: `path` is what was asked for, `file` and `line` where. */
export class SheetBuildError extends Error {
  constructor(
    readonly problem: SheetBuildProblem,
    readonly path: string,
    readonly file: string,
    readonly line: number,
    detail: string,
  ) {
    super(`${detail} (${file}, line ${line})`);
    this.name = 'SheetBuildError';
  }
}

const INCLUDE = /<lk-include\s+src\s*=\s*(["'])([^"']*)\1\s*\/?>(?:\s*<\/lk-include>)?/gi;
const ASSET_IN_URL = /url\(\s*(["']?)asset:([^"')\s]*)\1\s*\)/g;
const ASSET_IN_ATTRIBUTE = /=\s*(["'])asset:([^"']*)\1/g;

function lineAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/** The text of the entry page with every `<lk-include src>` replaced by that html file, nested
 *  up to `SHEET_INCLUDE_MAX_DEPTH`. Throws `SheetBuildError` for a missing entry or include, a
 *  cycle, or too deep a nesting.
 *
 *  Example: `expandSheetPage([{ path: 'index.html', content: '<lk-include src="a.html">' }, a])` */
export function expandSheetPage(files: readonly SheetSourceFile[]): string {
  const pages = new Map(
    files.filter(({ path }) => path.endsWith('.html')).map(({ path, content }) => [path, content]),
  );
  const entry = pages.get(SHEET_ENTRY_PAGE);
  if (entry === undefined)
    throw new SheetBuildError('no_entry', SHEET_ENTRY_PAGE, SHEET_ENTRY_PAGE, 1, 'no index.html');
  return expandPage(pages, [SHEET_ENTRY_PAGE], entry);
}

function expandPage(
  pages: ReadonlyMap<string, string>,
  chain: readonly string[],
  text: string,
): string {
  const file = chain.at(-1) ?? SHEET_ENTRY_PAGE;
  return text.replace(INCLUDE, (_match, _quote, path: string, offset: number) => {
    const included = includedPage(pages, chain, path, file, lineAt(text, offset));
    return expandPage(pages, [...chain, path], included);
  });
}

function includedPage(
  pages: ReadonlyMap<string, string>,
  chain: readonly string[],
  path: string,
  file: string,
  line: number,
): string {
  const page = pages.get(path);
  if (page === undefined)
    throw new SheetBuildError('missing_include', path, file, line, `include "${path}" not found`);
  if (chain.includes(path)) {
    const cycle = [...chain.slice(chain.indexOf(path)), path].join(' → ');
    throw new SheetBuildError('include_cycle', path, file, line, `include cycle ${cycle}`);
  }
  if (chain.length > SHEET_INCLUDE_MAX_DEPTH)
    throw new SheetBuildError(
      'include_too_deep',
      path,
      file,
      line,
      `include "${path}" at depth ${chain.length}; expected at most ${SHEET_INCLUDE_MAX_DEPTH}`,
    );
  return page;
}

function dataUrlOf(
  assets: ReadonlyMap<string, SheetAssetData>,
  path: string,
  file: string,
  line: number,
): string {
  const asset = assets.get(path);
  if (!asset)
    throw new SheetBuildError('missing_asset', path, file, line, `asset "${path}" not declared`);
  return `data:${asset.type};base64,${asset.base64}`;
}

/** `text` (the CSS or the html of `file`) with every `url(asset:…)` and every attribute
 *  `="asset:…"` turned into the `data:` url of that asset, so the page needs no network. A path
 *  the manifest does not list throws `SheetBuildError`.
 *
 *  Example: `inlineSheetAssets('src: url("asset:fontes/x.woff2")', 'estilo.css', assets)` */
export function inlineSheetAssets(
  text: string,
  file: string,
  assets: ReadonlyMap<string, SheetAssetData>,
): string {
  const inUrls = text.replace(ASSET_IN_URL, (_match, _quote, path: string, offset: number) => {
    return `url("${dataUrlOf(assets, path, file, lineAt(text, offset))}")`;
  });
  return inUrls.replace(
    ASSET_IN_ATTRIBUTE,
    (_match, quote: string, path: string, offset: number) => {
      return `=${quote}${dataUrlOf(assets, path, file, lineAt(inUrls, offset))}${quote}`;
    },
  );
}

const PROBLEM_TEXT: Readonly<Record<SheetBuildProblem, (error: SheetBuildError) => string>> = {
  no_entry: () => 'o modelo não tem o arquivo index.html',
  missing_include: (error) => `o arquivo "${error.path}" incluído não existe`,
  include_cycle: (error) => `"${error.path}" inclui a si mesmo (um ciclo de <lk-include>)`,
  include_too_deep: () => `<lk-include> aninhado em mais de ${SHEET_INCLUDE_MAX_DEPTH} níveis`,
  missing_asset: (error) => `o asset "${error.path}" não está no manifesto`,
};

/** The build error in words for the master: what went wrong and where.
 *
 *  Example: `sheetBuildErrorText(error) // 'o arquivo "a.html" incluído não existe (index.html, linha 3)'` */
export function sheetBuildErrorText(error: SheetBuildError): string {
  return `${PROBLEM_TEXT[error.problem](error)} (${error.file}, linha ${error.line})`;
}
