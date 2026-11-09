import { Extension, Node, getStyleProperty, mergeAttributes, type Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontFamily, FontSize, Color } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import {
  DOCUMENT_FONT_SIZE_MAX,
  DOCUMENT_FONT_SIZE_MIN,
  documentLinkDto,
} from '@lorkarium/contracts';
import { hexFromTyped } from '@/lib/custom-color';
import { documentFontOf, documentFontStack } from './document-fonts';

const DocumentSpacing = Extension.create({
  name: 'documentSpacing',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: null,
            parseHTML: (element) => {
              const pixels = parseFloat(element.style.marginLeft);
              return Number.isFinite(pixels)
                ? Math.min(6, Math.max(0, Math.round(pixels / 24)))
                : null;
            },
            renderHTML: (attrs) =>
              attrs.indent ? { style: `margin-left: ${Number(attrs.indent) * 24}px` } : {},
          },
          lineHeight: {
            default: null,
            parseHTML: (element) =>
              [1, 1.15, 1.5, 2].includes(Number(element.style.lineHeight))
                ? Number(element.style.lineHeight)
                : null,
            renderHTML: (attrs) =>
              attrs.lineHeight ? { style: `line-height: ${Number(attrs.lineHeight)}` } : {},
          },
        },
      },
    ];
  },
});

// Same commands as Tiptap's FontFamily; only the vocabulary is closed and drawn as a stack.
const DocumentFontFamily = FontFamily.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (element) => documentFontOf(element.style.fontFamily),
            renderHTML: (attrs) => {
              const font = documentFontOf(String(attrs.fontFamily ?? ''));
              return font ? { style: `font-family: ${documentFontStack(font)}` } : {};
            },
          },
        },
      },
    ];
  },
});

function pastedFontSize(element: HTMLElement): string | null {
  const size = /^(\d+(?:\.\d+)?|\.\d+)(px|pt)$/.exec(element.style.fontSize);
  if (!size) return null;
  const pixels = Math.round(Number(size[1]) * (size[2] === 'pt' ? 4 / 3 : 1));
  return `${Math.min(DOCUMENT_FONT_SIZE_MAX, Math.max(DOCUMENT_FONT_SIZE_MIN, pixels))}px`;
}

function pastedColor(element: HTMLElement): string | null {
  const inlineColor = getStyleProperty(element, 'color');
  if (inlineColor?.startsWith('#')) {
    const hex = hexFromTyped(inlineColor);
    if (hex) return hex;
  }
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(element.style.color);
  if (!rgb) return null;
  return `#${rgb
    .slice(1)
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

const DocumentFontSize = FontSize.extend({
  addGlobalAttributes() {
    return (
      this.parent?.().map(({ types, attributes }) => ({
        types,
        attributes: {
          ...attributes,
          fontSize: { ...attributes.fontSize, parseHTML: pastedFontSize },
        },
      })) ?? []
    );
  },
});

const DocumentColor = Color.extend({
  addGlobalAttributes() {
    return (
      this.parent?.().map(({ types, attributes }) => ({
        types,
        attributes: { ...attributes, color: { ...attributes.color, parseHTML: pastedColor } },
      })) ?? []
    );
  },
});

function documentImage(assetUrl: (assetId: string) => string): Node {
  return Node.create({
    name: 'image',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
      return {
        assetId: { default: null },
        alt: { default: null },
        align: { default: null },
        width: { default: null },
      };
    },
    parseHTML() {
      return [];
    },
    renderHTML({ HTMLAttributes }) {
      const { assetId, alt, align, width } = HTMLAttributes;
      return [
        'img',
        mergeAttributes({
          src: assetUrl(String(assetId)),
          alt: alt ?? '',
          draggable: 'true',
          style: `max-width:100%;height:auto;${width ? `width:${Number(width)}px;` : ''}${align === 'center' ? 'margin-inline:auto;' : align === 'right' ? 'margin-left:auto;' : ''}`,
        }),
      ];
    },
  });
}

/** Configures only the supported document vocabulary. Example: documentExtensions(id => `/api/assets/${id}`). */
export function documentExtensions(assetUrl: (assetId: string) => string): Extensions {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: false,
        isAllowedUri: (url) => documentLinkDto.safeParse(url).success,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      },
    }),
    TextStyle,
    DocumentFontFamily,
    DocumentFontSize,
    DocumentColor,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    DocumentSpacing,
    documentImage(assetUrl),
    Table.configure({ resizable: false, allowTableNodeSelection: true }),
    TableRow,
    TableCell,
    TableHeader,
  ];
}
