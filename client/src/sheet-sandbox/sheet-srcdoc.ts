// Relative on purpose: the e2e imports this file from outside the client, where `@/` does not
// resolve (docs/context/sheets/sandbox.md).
import { SHEET_BRIDGE_BOOTSTRAP } from './sheet-bridge-bootstrap';

/** The policy every sheet runs under: no network at all (fonts and images only inline), no form
 *  target and no `<base>`. It travels as the first `<meta>`, since a srcdoc has no headers. */
export const SHEET_CONTENT_SECURITY_POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'";

/** The page a sheet starts from, before the author's CSS: the app's dark background and text
 *  (the browser's white page would hide a sheet written for the dark room). The author's CSS
 *  comes later with the same weight, so any of it wins. */
export const SHEET_BASE_STYLE =
  ':root{color-scheme:dark;background:#101216;color:#eae5da;font-family:system-ui,sans-serif}';

/** The author's code of one sheet template. */
export interface SheetSource {
  readonly html: string;
  readonly css: string;
  readonly js: string;
}

/** A line and column, 1-based, as the browser reports them. */
export interface SheetCodePosition {
  readonly line: number;
  readonly column: number;
}

// `</script` would end the element early; `<!--` followed by `<script` would make the parser
// skip the real closing tag. `<\/` and `<\!` mean the same thing inside a JS string.
function inertScript(js: string): string {
  return js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

// `\/` is an escaped `/` in CSS, so the rule keeps its meaning and the element stays open.
function inertStyle(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1');
}

// Everything before the author's JS: its length and newlines place the JS inside the srcdoc.
function beforeAuthorScript(source: SheetSource): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${SHEET_CONTENT_SECURITY_POLICY}">`,
    `<script>${SHEET_BRIDGE_BOOTSTRAP}</script>`,
    `<style>${SHEET_BASE_STYLE}</style>`,
    `<style>${inertStyle(source.css)}</style>`,
    `</head><body>${source.html}`,
    '<script>',
  ].join('');
}

/** The `srcdoc` of a sheet frame: the policy, then the bridge bootstrap, then the base style and
 *  the author's CSS, HTML and JS, in that order, so the SDK exists before any author code runs.
 *
 *  Example: `<iframe srcdoc={buildSheetSrcdoc({ html, css, js })} sandbox="allow-scripts" />` */
export function buildSheetSrcdoc(source: SheetSource): string {
  return `${beforeAuthorScript(source)}${inertScript(source.js)}</script></body></html>`;
}

/** Where the author's JS starts in the srcdoc: its first line and how many characters of the
 *  srcdoc come before it on that line.
 *
 *  Example: `authorScriptStartOf(source) // { line: 212, column: 48 }` */
export function authorScriptStartOf(source: SheetSource): SheetCodePosition {
  const before = beforeAuthorScript(source);
  const lines = before.split('\n');
  return { line: lines.length, column: (lines.at(-1) ?? '').length };
}

/** The first of the srcdoc `positions` (an error's line, then its stack) that falls inside the
 *  author's JS, as a line and column of the editor's JS file; `null` when none does (the error
 *  came from the SDK, from an inline handler of the HTML, or had no line).
 *
 *  Example: `authorScriptPositionOf(source, [{ line: 214, column: 9 }]) // { line: 3, column: 9 }` */
export function authorScriptPositionOf(
  source: SheetSource,
  positions: readonly SheetCodePosition[],
): SheetCodePosition | null {
  const start = authorScriptStartOf(source);
  const lineCount = source.js.split('\n').length;
  for (const position of positions) {
    const line = position.line - start.line + 1;
    if (line < 1 || line > lineCount) continue;
    if (line === 1 && position.column <= start.column) continue;
    return { line, column: line === 1 ? position.column - start.column : position.column };
  }
  return null;
}
