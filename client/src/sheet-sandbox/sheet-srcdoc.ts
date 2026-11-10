// Relative on purpose: the e2e imports this file from outside the client, where `@/` does not
// resolve (docs/context/sheets/sandbox.md).
import { SHEET_BRIDGE_BOOTSTRAP } from './sheet-bridge-bootstrap';
import { sha256Base64 } from '../lib/sha256';
import {
  expandSheetPage,
  inlineSheetAssets,
  type SheetAssetData,
  type SheetSourceFile,
} from './sheet-page-assembly';

const SCRIPT_HASH_SHAPE = /^[A-Za-z0-9+/]{43}=$/;

// A hash lands inside the policy: a quote or a space there would rewrite it.
function requireScriptHash(hash: string): string {
  if (SCRIPT_HASH_SHAPE.test(hash)) return `'sha256-${hash}'`;
  throw new RangeError(
    `sheet script hash must be 44 characters of base64 (a SHA-256); received ${JSON.stringify(hash)}`,
  );
}

/** The policy every sheet runs under: only the scripts whose SHA-256 is listed run (the bootstrap
 *  and each JS file the host embedded; `script-src-attr 'none'` refuses every `on*` attribute), so
 *  html that arrives from the sheet's data never executes. Hashes, never a nonce: a nonced script
 *  hands its nonce to the `import()` it calls, and the import would reach the network. No network
 *  at all (fonts and images only inline), no form target and no `<base>`. It travels as the first
 *  `<meta>`, since a srcdoc has no headers.
 *
 *  Example: `sheetContentSecurityPolicy([hash]) // "default-src 'none'; script-src 'sha256-…'; …"` */
export function sheetContentSecurityPolicy(scriptHashes: readonly string[]): string {
  const scriptSources = scriptHashes.map(requireScriptHash).join(' ') || "'none'";
  return [
    "default-src 'none'",
    `script-src ${scriptSources}`,
    "script-src-attr 'none'",
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
}

/** The page a sheet starts from, before the author's CSS: the app's dark background and text
 *  (the browser's white page would hide a sheet written for the dark room). The author's CSS
 *  comes later with the same weight, so any of it wins. */
export const SHEET_BASE_STYLE =
  ':root{color-scheme:dark;background:#101216;color:#eae5da;font-family:system-ui,sans-serif}';

/** The author's template: its files in order (CSS and JS run in it) and, when it uses any, the
 *  bytes of its assets by path. */
export interface SheetSource {
  readonly files: readonly SheetSourceFile[];
  readonly assets?: ReadonlyMap<string, SheetAssetData>;
}

/** A line and column, 1-based, as the browser reports them. */
export interface SheetCodePosition {
  readonly line: number;
  readonly column: number;
}

/** A line and column of one JS file of the template. */
export interface SheetScriptPosition extends SheetCodePosition {
  readonly path: string;
}

// `</script` would end the element early; `<!--` followed by `<script` would make the parser
// skip the real closing tag. `<\/` and `<\!` mean the same thing inside a JS string.
function inertScript(js: string): string {
  return js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

const REPLACEMENT_CHARACTER = String.fromCodePoint(0xfffd);

// The browser hashes a script's text after parsing, and the parser turns CR LF and CR into LF and
// a U+0000 inside a script into U+FFFD: embedding the text already in that form keeps the hash in
// the policy equal to the one the browser computes.
function parsedScriptText(js: string): string {
  return js.replace(/\r\n?/g, '\n').replace(/\0/g, REPLACEMENT_CHARACTER);
}

// Exactly the text between `<script>` and `</script>`. The leading newline starts every author
// script at column 0 of its own line.
function authorScriptText(js: string): string {
  return `\n${inertScript(parsedScriptText(js))}`;
}

const BOOTSTRAP_HASH = sha256Base64(SHEET_BRIDGE_BOOTSTRAP);

// `\/` is an escaped `/` in CSS, so the rule keeps its meaning and the element stays open.
function inertStyle(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1');
}

function filesOfKind(source: SheetSource, extension: string): readonly SheetSourceFile[] {
  return source.files.filter(({ path }) => path.endsWith(extension));
}

const NO_ASSETS: ReadonlyMap<string, SheetAssetData> = new Map();

// The asset urls hold no newline, so the lines of what comes before each script do not depend on
// them: the layout is measured without (`assets` null) and the frame is built with them.
function beforeScripts(
  source: SheetSource,
  policy: string,
  assets: ReadonlyMap<string, SheetAssetData> | null,
): string {
  const inline = (text: string, file: string): string =>
    assets ? inlineSheetAssets(text, file, assets) : text;
  const styles = filesOfKind(source, '.css').map(
    ({ path, content }) => `<style>${inertStyle(inline(content, path))}</style>`,
  );
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${policy}">`,
    `<script>${SHEET_BRIDGE_BOOTSTRAP}</script>`,
    `<style>${SHEET_BASE_STYLE}</style>`,
    ...styles,
    `</head><body>${inline(expandSheetPage(source.files), 'index.html')}`,
  ].join('');
}

/** The `srcdoc` of a sheet frame: the policy, then the bridge bootstrap, then the base style and
 *  each CSS file in order, the entry page with its `<lk-include>` expanded, and each JS file in
 *  order in a script of its own, so the SDK exists before any author code and the markup before
 *  any author script. The policy lists the SHA-256 of every one of those scripts and of nothing
 *  else; every `asset:` url becomes a `data:` url. Throws `SheetBuildError` when the files do not
 *  make a page.
 *
 *  Example: `<iframe srcdoc={buildSheetSrcdoc({ files })} sandbox="allow-scripts" />` */
export function buildSheetSrcdoc(source: SheetSource): string {
  const scripts = filesOfKind(source, '.js').map(({ content }) => authorScriptText(content));
  const policy = sheetContentSecurityPolicy([BOOTSTRAP_HASH, ...scripts.map(sha256Base64)]);
  const page = beforeScripts(source, policy, source.assets ?? NO_ASSETS);
  return `${page}${scripts.map((text) => `<script>${text}</script>`).join('')}</body></html>`;
}

/** Whether two sources would build the same page: the same files in the same order and the same
 *  asset map (by identity: the host reads the bytes once per manifest).
 *
 *  Example: `sameSheetSource(shown, draft) // true while the master only moved the cursor` */
export function sameSheetSource(a: SheetSource, b: SheetSource): boolean {
  if (a.assets !== b.assets || a.files.length !== b.files.length) return false;
  return a.files.every((file, at) => {
    const other = b.files[at];
    return other !== undefined && other.path === file.path && other.content === file.content;
  });
}

// The policy holds no newline, so the lines before the scripts do not depend on the hashes.
const MEASURING_POLICY = sheetContentSecurityPolicy([]);

type ScriptPlace = Readonly<{ path: string; line: number; lineCount: number }>;

const layouts = new WeakMap<SheetSource, readonly ScriptPlace[]>();

/** Where each JS file of `source` starts in the srcdoc (its first line; column 0), in order;
 *  measured once per source object, since a console line asks it again and again.
 *
 *  Example: `sheetScriptLayoutOf(source)[1] // { path: 'b.js', line: 214, lineCount: 12 }` */
export function sheetScriptLayoutOf(source: SheetSource): readonly ScriptPlace[] {
  const known = layouts.get(source);
  if (known) return known;
  let line = parsedScriptText(beforeScripts(source, MEASURING_POLICY, null)).split('\n').length;
  const places = filesOfKind(source, '.js').map(({ path, content }) => {
    const lineCount = parsedScriptText(content).split('\n').length;
    const place = { path, line: line + 1, lineCount };
    line += lineCount;
    return place;
  });
  layouts.set(source, places);
  return places;
}

/** The first of the srcdoc `positions` (an error's line, then its stack) that falls inside one of
 *  the author's JS files, as that file and its line and column; `null` when none does (the error
 *  came from the SDK or from the HTML, had no line, or the files do not make a page).
 *
 *  Example: `authorScriptPositionOf(source, [{ line: 214, column: 9 }]) // { path: 'a.js', line: 3, column: 9 }` */
export function authorScriptPositionOf(
  source: SheetSource,
  positions: readonly SheetCodePosition[],
): SheetScriptPosition | null {
  const places = safeLayoutOf(source);
  for (const position of positions) {
    const place = places.find(
      ({ line, lineCount }) => position.line >= line && position.line < line + lineCount,
    );
    if (place)
      return { path: place.path, line: position.line - place.line + 1, column: position.column };
  }
  return null;
}

function safeLayoutOf(source: SheetSource): readonly ScriptPlace[] {
  try {
    return sheetScriptLayoutOf(source);
  } catch {
    return [];
  }
}
