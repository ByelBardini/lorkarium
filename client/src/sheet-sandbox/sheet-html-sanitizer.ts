/** A node of a parsed html document, reduced to what `html.sanitize` reads and writes. */
export interface SheetHtmlNode {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly nodeValue: string | null;
  readonly childNodes: ArrayLike<SheetHtmlNode>;
  getAttribute?(name: string): string | null;
}

/** An element `html.sanitize` builds its clean copy in. */
export interface SheetHtmlElement extends SheetHtmlNode {
  innerHTML: string;
  setAttribute(name: string, value: string): void;
  appendChild(child: SheetHtmlNode): unknown;
}

/** A document parsed by the frame's `DOMParser`: inert (no script runs, nothing loads). */
export interface SheetHtmlDocument {
  readonly body: SheetHtmlElement;
  createElement(tag: string): SheetHtmlElement;
  createTextNode(text: string): SheetHtmlNode;
}

/** The frame's `DOMParser` class, structural so the e2e needs no DOM types. */
export type SheetHtmlParserClass = new () => {
  parseFromString(text: string, type: 'text/html'): SheetHtmlDocument;
};

/** `lorkarium.html.sanitize`: html of a rich text in, clean html out. */
export type SheetHtmlSanitizer = (html: unknown) => string;

// Serialized by `toString` into the srcdoc next to the bootstrap, so it may reference nothing
// outside its own body (the spec runs the serialized text). The parser is captured by the
// bootstrap call before the author's code runs, so replacing `window.DOMParser` later cannot
// bend it. Formatting tags only; `div` becomes `p`; a dropped tag goes with all it holds, any
// other unknown tag gives way to its text. The parsed document is inert, so nothing in it runs or
// loads while it is read.
function createHtmlSanitizer(HtmlParser: SheetHtmlParserClass): SheetHtmlSanitizer {
  const keptTag = /^(p|br|hr|strong|b|em|i|u|s|span|blockquote|ul|ol|li|h[1-6]|img)$/;
  const droppedTag =
    /^(script|style|iframe|object|embed|svg|math|template|noscript|textarea|select|link|meta|title|frame|frameset)$/;
  const plainColor = /^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([\d\s.,%]+\))$/i;
  const textAlign = /^(left|right|center|justify|start|end)$/i;
  // No network inside the frame: an image shows only what is already in it.
  const imageSource = /^(blob:|data:image\/)/i;

  function cleanStyle(style: string): string {
    const kept: string[] = [];
    const declarations = style.split(';');
    for (let index = 0; index < declarations.length; index += 1) {
      const [rawName = '', ...rest] = declarations[index]!.split(':');
      const name = rawName.trim().toLowerCase();
      const value = rest.join(':').trim();
      if (name === 'color' && plainColor.test(value)) kept[kept.length] = `color:${value}`;
      if (name === 'text-align' && textAlign.test(value)) kept[kept.length] = `text-align:${value}`;
    }
    return kept.join(';');
  }

  // `null`: the element goes away whole (an image with nothing safe to show).
  function cleanElement(
    source: SheetHtmlNode,
    tag: string,
    into: SheetHtmlDocument,
  ): SheetHtmlElement | null {
    const element = into.createElement(tag);
    const read = (name: string): string =>
      (source.getAttribute ? source.getAttribute(name) : null) ?? '';
    if (tag === 'img') {
      const src = read('src').trim();
      if (!imageSource.test(src)) return null;
      element.setAttribute('src', src);
    }
    const style = cleanStyle(read('style'));
    if (style !== '') element.setAttribute('style', style);
    return element;
  }

  function cleanChildren(
    source: SheetHtmlNode,
    target: SheetHtmlElement,
    into: SheetHtmlDocument,
  ): void {
    const children = source.childNodes;
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index]!;
      if (child.nodeType === 3) target.appendChild(into.createTextNode(child.nodeValue ?? ''));
      if (child.nodeType !== 1) continue;
      const name = child.nodeName.toLowerCase();
      if (droppedTag.test(name)) continue;
      const tag = name === 'div' ? 'p' : name;
      if (!keptTag.test(tag)) {
        cleanChildren(child, target, into);
        continue;
      }
      const element = cleanElement(child, tag, into);
      if (element === null) continue;
      cleanChildren(child, element, into);
      target.appendChild(element);
    }
  }

  return function sanitizeHtml(html: unknown): string {
    if (typeof html !== 'string')
      throw new TypeError(
        `lorkarium: html.sanitize received ${typeof html}; expected a string of html`,
      );
    const parsed = new HtmlParser().parseFromString(html, 'text/html');
    const clean = new HtmlParser().parseFromString('', 'text/html');
    cleanChildren(parsed.body, clean.body, clean);
    return clean.body.innerHTML;
  };
}

/** The text of the sanitizer factory, called by the bootstrap with the frame's `DOMParser`.
 *
 *  Example: `(${SHEET_HTML_SANITIZER_SOURCE})(window.DOMParser)` */
export const SHEET_HTML_SANITIZER_SOURCE = createHtmlSanitizer.toString();
