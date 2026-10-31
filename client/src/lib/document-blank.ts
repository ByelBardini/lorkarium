import type { DocumentContentDto } from '@lorkarium/contracts';

/** Whether a tab body holds nothing to lose: only empty paragraphs (no text, image or table).
 *
 *  Example: `isBlankDocumentContent(EMPTY_DOCUMENT_CONTENT)` → true */
export function isBlankDocumentContent(content: DocumentContentDto): boolean {
  return content.content.every(
    (node) => node.type === 'paragraph' && (node.content?.length ?? 0) === 0,
  );
}
