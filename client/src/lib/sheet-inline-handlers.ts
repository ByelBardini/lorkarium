/** An attribute of a template's HTML that the sheet frame will never run: an event attribute
 *  (`onclick`, `onerror`…) or a `javascript:` address. The frame's CSP refuses both. */
export interface InlineHandler {
  /** 1-based line of the attribute in the HTML file. */
  readonly line: number;
  /** The attribute's name, in lower case (`onclick`, `href`). */
  readonly attribute: string;
}

const EVENT_ATTRIBUTE = /^on[a-z]+$/;
const JAVASCRIPT_ADDRESS = /^\s*javascript:/i;
const TAG_NAME = /[a-zA-Z][^\s/>]*/y;
// Whitespace or a stray `/`, the name, then an optional value: quoted (a `>` inside stays in the
// value) or bare.
const ATTRIBUTE = /[\s/]*([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/y;
// Their text is not markup: a `<b onclick>` inside a script is code, not a tag.
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);

type Scan = Readonly<{ html: string; lower: string; found: InlineHandler[] }>;

/** Every attribute of `html` that will not run in the sheet frame, in the order written. Reads
 *  tags only: text, comments and the inside of `script`/`style` never count.
 *
 *  Example: `findInlineHandlers('<p>\n<button onclick="x()">') // [{ line: 2, attribute: 'onclick' }]` */
export function findInlineHandlers(html: string): InlineHandler[] {
  const scan: Scan = { html, lower: html.toLowerCase(), found: [] };
  let at = html.indexOf('<');
  while (at >= 0) at = html.indexOf('<', readMarkup(scan, at));
  return scan.found;
}

// Where the markup that opens at `at` ends.
function readMarkup(scan: Scan, at: number): number {
  if (scan.html.startsWith('<!--', at)) return endAfter(scan.lower, '-->', at + 4);
  TAG_NAME.lastIndex = at + 1;
  const name = TAG_NAME.exec(scan.html)?.[0];
  if (name === undefined) return at + 1;
  const end = readAttributes(scan, TAG_NAME.lastIndex);
  const tag = name.toLowerCase();
  return RAW_TEXT_TAGS.has(tag) ? endAfter(scan.lower, `</${tag}`, end) : end;
}

function readAttributes(scan: Scan, from: number): number {
  let at = from;
  for (;;) {
    ATTRIBUTE.lastIndex = at;
    const match = ATTRIBUTE.exec(scan.html);
    if (!match) return endAfter(scan.html, '>', at);
    inspectAttribute(scan, match);
    at = ATTRIBUTE.lastIndex;
  }
}

function inspectAttribute(scan: Scan, match: RegExpExecArray): void {
  const name = (match[1] ?? '').toLowerCase();
  const value = unquoted(match[2] ?? '');
  if (!EVENT_ATTRIBUTE.test(name) && !JAVASCRIPT_ADDRESS.test(value)) return;
  const nameAt = scan.html.indexOf(match[1] ?? '', match.index);
  scan.found.push({ line: lineAt(scan.html, nameAt), attribute: name });
}

function unquoted(value: string): string {
  const quote = value[0];
  return quote === '"' || quote === "'" ? value.slice(1, -1) : value;
}

function endAfter(text: string, needle: string, from: number): number {
  const at = text.indexOf(needle, from);
  return at < 0 ? text.length : at + needle.length;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let at = text.indexOf('\n'); at >= 0 && at < index; at = text.indexOf('\n', at + 1))
    line += 1;
  return line;
}
