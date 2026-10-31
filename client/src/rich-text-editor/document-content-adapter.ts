import { documentContentDto, type DocumentContentDto } from '@lorkarium/contracts';
import type { JSONContent } from '@tiptap/core';

const NODE_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  paragraph: ['textAlign', 'indent', 'lineHeight'],
  heading: ['level', 'textAlign', 'indent', 'lineHeight'],
  orderedList: ['start'],
  image: ['assetId', 'alt', 'align', 'width'],
  tableCell: ['colspan', 'rowspan', 'colwidth'],
  tableHeader: ['colspan', 'rowspan', 'colwidth'],
  textStyle: ['fontFamily', 'fontSize', 'color'],
  link: ['href'],
};

function cleanNode(node: JSONContent): JSONContent & { type: string } {
  const attributes = Object.fromEntries(
    Object.entries(node.attrs ?? {}).filter(
      // Tiptap's FontSize/Color read a pasted span without them as '' rather than null.
      ([key, value]) =>
        NODE_ATTRIBUTES[node.type ?? '']?.includes(key) && value !== null && value !== '',
    ),
  );
  const marks = cleanMarks(node.marks ?? []);
  return {
    type: node.type ?? '',
    ...(Object.keys(attributes).length ? { attrs: attributes } : {}),
    ...(node.text !== undefined ? { text: node.text } : {}),
    ...(node.content?.length ? { content: node.content.map(cleanNode) } : {}),
    ...(marks.length ? { marks } : {}),
  };
}

// A pasted style whose every value fell outside the vocabulary (a font not offered) leaves a
// textStyle with nothing in it: the text keeps no mark instead of failing the contract.
function cleanMarks(marks: readonly JSONContent[]): (JSONContent & { type: string })[] {
  return marks.map(cleanNode).filter((mark) => mark.type !== 'textStyle' || mark.attrs);
}

/** Removes rendering attributes and validates the persisted tree. Example: documentContentFromEditor(editor.getJSON()). */
export function documentContentFromEditor(value: JSONContent): DocumentContentDto {
  return documentContentDto.parse(cleanNode(value));
}
