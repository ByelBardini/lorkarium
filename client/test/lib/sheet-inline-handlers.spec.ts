import { describe, expect, it } from 'vitest';
import { findInlineHandlers } from '@/lib/sheet-inline-handlers';

describe('findInlineHandlers', () => {
  it('finds an onclick on line 3 of the template html', () => {
    const html = '<main>\n  <h1>Lyra</h1>\n  <button onclick="curar()">+1 PV</button>\n</main>';
    expect(findInlineHandlers(html)).toEqual([{ line: 3, attribute: 'onclick' }]);
  });

  it('an upper-case ONCLICK counts, named in lower case', () => {
    expect(findInlineHandlers('<button ONCLICK="curar()">x</button>')).toEqual([
      { line: 1, attribute: 'onclick' },
    ]);
  });

  it.each([
    ['single quotes', "<img src='x' onerror='falhou()'>"],
    ['no quotes', '<img src=x onerror=falhou()>'],
    ['no value', '<img src="x" onerror>'],
  ])('an event attribute with %s counts', (_case, html) => {
    expect(findInlineHandlers(html)).toEqual([{ line: 1, attribute: 'onerror' }]);
  });

  it('data-onclick is not an event attribute', () => {
    expect(findInlineHandlers('<button data-onclick="curar">x</button>')).toEqual([]);
  });

  it('the word onclick in the text of a paragraph does not count', () => {
    expect(
      findInlineHandlers('<p>Use onclick="x()" e javascript:void(0) com cuidado.</p>'),
    ).toEqual([]);
  });

  it('an attribute value that only mentions onclick does not count', () => {
    expect(
      findInlineHandlers('<input title="onclick=\'x()\'" value="javascript é legal">'),
    ).toEqual([]);
  });

  it('a javascript: href counts, in any case and with spaces before it', () => {
    const html = '<a href="javascript:void(0)">a</a>\n<a href=" JavaScript:curar()">b</a>';
    expect(findInlineHandlers(html)).toEqual([
      { line: 1, attribute: 'href' },
      { line: 2, attribute: 'href' },
    ]);
  });

  it('a value with > inside quotes does not end the tag early', () => {
    const html = '<button title="a > b" onclick="x()">x</button>';
    expect(findInlineHandlers(html)).toEqual([{ line: 1, attribute: 'onclick' }]);
  });

  it('the line is the one of the attribute, in a tag that spans lines', () => {
    const html = '<button\n  type="button"\n  onclick="x()"\n>x</button>';
    expect(findInlineHandlers(html)).toEqual([{ line: 3, attribute: 'onclick' }]);
  });

  it('several in one tag come in order', () => {
    expect(findInlineHandlers('<div onmouseover="a()" onmouseout="b()"></div>')).toEqual([
      { line: 1, attribute: 'onmouseover' },
      { line: 1, attribute: 'onmouseout' },
    ]);
  });

  it('a comment, a script and a style hold no tags', () => {
    const html =
      '<!-- <button onclick="velho()"> -->\n<script>if (a <b onclick="x">) {}</script>\n<style>a[onclick] { color: red }</style>';
    expect(findInlineHandlers(html)).toEqual([]);
  });

  it('html with none gives an empty list', () => {
    expect(findInlineHandlers('<main><button id="curar" type="button">+1</button></main>')).toEqual(
      [],
    );
    expect(findInlineHandlers('')).toEqual([]);
  });
});
