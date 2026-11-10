import { beforeEach, describe, expect, it } from 'vitest';
import { SHEET_BRIDGE_BOOTSTRAP } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import {
  SHEET_HTML_SANITIZER_SOURCE,
  type SheetHtmlParserClass,
  type SheetHtmlSanitizer,
} from '@/sheet-sandbox/sheet-html-sanitizer';
import { SheetFrameWindowFake } from '../support/sheet-frame-fakes';

// Runs the exact text the srcdoc embeds, with the fake as its `window` (jsdom's DOMParser): a
// reference to anything outside the bootstrap's own function would fail here as in the frame.
function bootFrame(): SheetFrameWindowFake {
  const frame = new SheetFrameWindowFake();
  new Function('window', SHEET_BRIDGE_BOOTSTRAP)(frame);
  return frame;
}

let sanitize: (html: unknown) => string;

beforeEach(() => {
  sanitize = bootFrame().sdk.html.sanitize as (html: unknown) => string;
});

describe('lorkarium.html.sanitize: formatting that stays', () => {
  it('keeps a colored strong inside a paragraph as it was', () => {
    const html = '<p><strong style="color:#e2c793">2 MP</strong></p>';
    expect(sanitize(html)).toBe(html);
  });

  it.each([
    ['<h4>Golpe Atordoante</h4>'],
    ['<blockquote>Gaste 2 MP.</blockquote>'],
    ['<ul><li>Alcance curto</li><li>Ação padrão</li></ul>'],
    ['<p>Antes</p><hr><p>Depois</p>'],
    ['<p><em>raro</em> e <u>único</u></p>'],
    ['<p style="text-align:center">Centro</p>'],
  ])('keeps %s', (html) => {
    expect(sanitize(html)).toBe(html);
  });

  it('keeps an image shown from a blob: address', () => {
    const html = '<p><img src="blob:null/3f6e1c2a-8b7d-4e9f-a1b2-c3d4e5f6a7b8"></p>';
    expect(sanitize(html)).toBe(html);
  });

  it('keeps an inline data:image', () => {
    const html = '<img src="data:image/png;base64,iVBORw0KGgo=">';
    expect(sanitize(html)).toBe(html);
  });

  it('keeps the text escaped, so the result is safe to put back in innerHTML', () => {
    expect(sanitize('<p>1 &lt; 2 &amp; &lt;b&gt;</p>')).toBe('<p>1 &lt; 2 &amp; &lt;b&gt;</p>');
  });
});

describe('lorkarium.html.sanitize: what is rewritten', () => {
  it('turns a div into a paragraph', () => {
    expect(sanitize('<div>Força 14</div>')).toBe('<p>Força 14</p>');
  });

  it('drops an unknown tag and keeps its text', () => {
    expect(sanitize('<p><marquee>Lyra</marquee> de Vharn</p>')).toBe('<p>Lyra de Vharn</p>');
  });

  it('keeps only color and text-align of a style', () => {
    expect(
      sanitize(
        '<p style="color: red; position: fixed; text-align: center; background: url(x)">a</p>',
      ),
    ).toBe('<p style="color:red;text-align:center">a</p>');
  });

  it('drops a color that is not a plain color value', () => {
    expect(sanitize('<p style="color: expression(alert(1))">a</p>')).toBe('<p>a</p>');
  });

  it('drops every attribute other than style and the image source', () => {
    expect(sanitize('<p id="x" class="y" title="z" data-lk="forca">a</p>')).toBe('<p>a</p>');
  });

  it('an empty string stays empty', () => {
    expect(sanitize('')).toBe('');
  });
});

describe('lorkarium.html.sanitize: what could run or reach the network is removed', () => {
  it('removes the onerror of an image and keeps the image', () => {
    expect(sanitize('<img src="data:image/png;base64,AA==" onerror="alert(1)">')).toBe(
      '<img src="data:image/png;base64,AA==">',
    );
  });

  it('removes an image whose source is not blob: or data:image', () => {
    expect(sanitize('<p>a<img src=x onerror="alert(1)">b</p>')).toBe('<p>ab</p>');
  });

  it('removes an image that would load from the network', () => {
    expect(sanitize('<p><img src="https://example.org/pixel.png"></p>')).toBe('<p></p>');
  });

  it.each([
    ['a script', '<p>a</p><script>alert(1)</script>'],
    ['an iframe', '<p>a</p><iframe src="https://example.org">x</iframe>'],
    ['an svg with onload', '<p>a</p><svg onload="alert(1)"><text>x</text></svg>'],
    ['a style element', '<p>a</p><style>p { color: red }</style>'],
  ])('removes %s with all it holds', (_name, html) => {
    expect(sanitize(html)).toBe('<p>a</p>');
  });

  it('removes a javascript: link and keeps its text', () => {
    expect(sanitize('<p><a href="javascript:alert(1)">clique</a></p>')).toBe('<p>clique</p>');
  });

  it('removes an event attribute in any case', () => {
    expect(sanitize('<p ONCLICK="alert(1)" onMouseOver="x()">a</p>')).toBe('<p>a</p>');
  });
});

describe('lorkarium.html.sanitize: what it refuses', () => {
  it.each([
    [42, 'number'],
    [null, 'object'],
    [undefined, 'undefined'],
    [{ html: '<p>a</p>' }, 'object'],
  ])('%j is refused with a TypeError citing its type', (input, type) => {
    expect(() => sanitize(input)).toThrow(
      new TypeError(`lorkarium: html.sanitize received ${type}; expected a string of html`),
    );
  });
});

describe('the sanitizer text the srcdoc embeds', () => {
  it('runs from its own serialized text, given only a parser', () => {
    const create = new Function(`return (${SHEET_HTML_SANITIZER_SOURCE});`)() as (
      parser: SheetHtmlParserClass,
    ) => SheetHtmlSanitizer;
    const clean = create(DOMParser as unknown as SheetHtmlParserClass);
    expect(clean('<div onclick="x()">a</div>')).toBe('<p>a</p>');
  });
});

describe('lorkarium.html.sanitize: the SDK object', () => {
  it('is frozen, so the author cannot swap the sanitizer', () => {
    const frame = bootFrame();
    expect(Object.isFrozen(frame.sdk.html)).toBe(true);
  });

  it('keeps working after the author replaces the window DOMParser', () => {
    const frame = bootFrame();
    (frame as unknown as { DOMParser: unknown }).DOMParser = class {
      parseFromString(): never {
        throw new Error('replaced by the author');
      }
    };
    expect(frame.sdk.html.sanitize('<p>a</p>')).toBe('<p>a</p>');
  });
});
