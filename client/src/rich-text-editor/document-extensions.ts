import { Extension, Node, mergeAttributes, type Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle, FontFamily, FontSize, Color } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { documentLinkDto } from '@lorkarium/contracts';
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
            parseHTML: (element) =>
              element.style.marginLeft
                ? Math.min(6, Math.max(0, Math.round(parseFloat(element.style.marginLeft) / 24)))
                : null,
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
    FontSize,
    Color,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    DocumentSpacing,
    documentImage(assetUrl),
    Table.configure({ resizable: false, allowTableNodeSelection: true }),
    TableRow,
    TableCell,
    TableHeader,
  ];
}
