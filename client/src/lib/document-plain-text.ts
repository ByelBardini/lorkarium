import type { DocumentContentDto, DocumentNodeDto } from '@lorkarium/contracts';

// Blocks that only hold other blocks: their lines are their children's.
const CONTAINERS = new Set(['bulletList', 'orderedList', 'listItem', 'blockquote']);
// Blocks with no text to read.
const SILENT = new Set(['image', 'horizontalRule']);

/** The plain text of a document tab: one line per paragraph or heading (an empty paragraph is an
 *  empty line), a hard break as a line break, and a table row per line with its cells split by a
 *  tab. Images and rules give nothing.
 *
 *  Example: `documentPlainText({ type: 'doc', content: [paragraph('Goblin')] }) // 'Goblin'` */
export function documentPlainText(content: DocumentContentDto): string {
  return linesOf(content.content).join('\n');
}

function linesOf(nodes: readonly DocumentNodeDto[]): string[] {
  return nodes.flatMap(blockLines);
}

function blockLines(node: DocumentNodeDto): string[] {
  const children = node.content ?? [];
  if (node.type === 'table') return children.map(rowText);
  if (CONTAINERS.has(node.type)) return linesOf(children);
  if (SILENT.has(node.type)) return [];
  return [inlineText(children)];
}

function rowText(row: DocumentNodeDto): string {
  const cells = row.content ?? [];
  return cells.map((cell) => linesOf(cell.content ?? []).join(' ')).join('\t');
}

function inlineText(nodes: readonly DocumentNodeDto[]): string {
  return nodes.map((node) => (node.type === 'hardBreak' ? '\n' : (node.text ?? ''))).join('');
}
