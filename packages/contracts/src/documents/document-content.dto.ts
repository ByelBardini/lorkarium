import { z } from 'zod';

export const DOCUMENT_CONTENT_MAX_BYTES = 512 * 1024;
export const DOCUMENT_CONTENT_MAX_NODES = 10_000;
export const DOCUMENT_CONTENT_MAX_DEPTH = 16;
export const DOCUMENT_CONTENT_MAX_TEXT = 100_000;
export const DOCUMENT_CONTENT_MAX_IMAGES = 50;
// The three bundled with the app first; the rest are the usual Windows fonts, drawn by the
// reader's own copy (another system falls back to a similar family).
export const DOCUMENT_FONTS = [
  'Hanken Grotesk',
  'Cormorant Garamond',
  'JetBrains Mono',
  'Arial',
  'Arial Black',
  'Calibri',
  'Cambria',
  'Comic Sans MS',
  'Consolas',
  'Courier New',
  'Garamond',
  'Georgia',
  'Impact',
  'Palatino Linotype',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'Symbol',
  'Webdings',
  'Wingdings',
] as const;
export type DocumentFont = (typeof DOCUMENT_FONTS)[number];
export const DOCUMENT_FONT_SIZE_MIN = 8;
export const DOCUMENT_FONT_SIZE_MAX = 72;
export const documentLinkDto = z
  .string()
  .trim()
  .max(2048)
  .pipe(z.url())
  .refine(
    (link) => /^(https?:|mailto:)/i.test(link) && !/^https?:\/\/[^/?#]*@/i.test(link),
    'Expected http, https or mailto URL without credentials',
  );
const alignmentDto = z.enum(['left', 'center', 'right', 'justify']);
const paragraphAttrsDto = z.strictObject({
  textAlign: alignmentDto.optional(),
  indent: z.number().int().min(0).max(6).optional(),
  lineHeight: z.union([z.literal(1), z.literal(1.15), z.literal(1.5), z.literal(2)]).optional(),
});
const styleAttrsDto = z.strictObject({
  fontFamily: z.enum(DOCUMENT_FONTS).optional(),
  fontSize: z
    .string()
    .regex(/^(?:[89]|[1-6]\d|7[0-2])px$/)
    .optional(),
  color: z
    .string()
    .regex(/^#[\da-f]{6}$/i)
    .optional(),
});
export const documentMarkDto = z.union([
  z.strictObject({ type: z.enum(['bold', 'italic', 'underline', 'strike']) }),
  z.strictObject({
    type: z.literal('link'),
    attrs: z.strictObject({
      href: documentLinkDto,
      target: z.literal('_blank').optional(),
      rel: z.literal('noopener noreferrer').optional(),
      class: z.null().optional(),
    }),
  }),
  z.strictObject({ type: z.literal('textStyle'), attrs: styleAttrsDto }),
]);
export type DocumentMarkDto = z.infer<typeof documentMarkDto>;
export interface DocumentNodeDto {
  type: string;
  attrs?: Record<string, string | number | null>;
  content?: DocumentNodeDto[];
  marks?: DocumentMarkDto[];
  text?: string;
}
export interface DocumentContentDto {
  type: 'doc';
  content: DocumentNodeDto[];
}
export const EMPTY_DOCUMENT_CONTENT: DocumentContentDto = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};
const nodeShapeDto = z.strictObject({
  type: z.enum([
    'doc',
    'paragraph',
    'text',
    'hardBreak',
    'heading',
    'bulletList',
    'orderedList',
    'listItem',
    'blockquote',
    'horizontalRule',
    'image',
    'table',
    'tableRow',
    'tableCell',
    'tableHeader',
  ]),
  attrs: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  content: z.array(z.unknown()).optional(),
  text: z.string().min(1).optional(),
  marks: z.array(documentMarkDto).optional(),
});
const imageAttrsDto = z.strictObject({
  assetId: z.uuid(),
  alt: z.string().max(1000).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  width: z.number().int().min(32).max(4096).optional(),
});
const cellAttrsDto = z.strictObject({
  colspan: z.literal(1).optional(),
  rowspan: z.literal(1).optional(),
  colwidth: z.null().optional(),
});
const BLOCKS = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'horizontalRule',
  'image',
  'table',
];
const CHILDREN: Readonly<Record<string, readonly string[]>> = {
  doc: BLOCKS,
  paragraph: ['text', 'hardBreak'],
  heading: ['text', 'hardBreak'],
  bulletList: ['listItem'],
  orderedList: ['listItem'],
  listItem: BLOCKS.filter((type) => type !== 'table'),
  blockquote: BLOCKS.filter((type) => type !== 'table'),
  table: ['tableRow'],
  tableRow: ['tableCell', 'tableHeader'],
  tableCell: BLOCKS.filter((type) => type !== 'table'),
  tableHeader: BLOCKS.filter((type) => type !== 'table'),
};

function validAttrs(node: z.infer<typeof nodeShapeDto>): boolean {
  const attrs = node.attrs ?? {};
  if (node.type === 'paragraph') return paragraphAttrsDto.safeParse(attrs).success;
  if (node.type === 'heading')
    return paragraphAttrsDto
      .extend({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]) })
      .safeParse(attrs).success;
  if (node.type === 'image') return imageAttrsDto.safeParse(attrs).success;
  if (node.type === 'orderedList')
    return z.strictObject({ start: z.number().int().min(1).optional() }).safeParse(attrs).success;
  if (node.type === 'tableCell' || node.type === 'tableHeader')
    return cellAttrsDto.safeParse(attrs).success;
  return Object.keys(attrs).length === 0;
}

function utf8Length(value: string): number {
  let length = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    length += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
  }
  return length;
}

function contentProblem(input: unknown): string | null {
  const pending: { value: unknown; depth: number; parent: string | null; table: boolean }[] = [
    { value: input, depth: 1, parent: null, table: false },
  ];
  let nodes = 0;
  let text = 0;
  let images = 0;
  while (pending.length > 0) {
    const entry = pending.pop();
    if (!entry) break;
    if (++nodes > DOCUMENT_CONTENT_MAX_NODES || entry.depth > DOCUMENT_CONTENT_MAX_DEPTH)
      return 'Document node or depth budget exceeded';
    const parsed = nodeShapeDto.safeParse(entry.value);
    if (!parsed.success) return 'Expected supported strict document node';
    const node = parsed.data;
    if (!validAttrs(node)) return `Invalid attributes for document node ${node.type}`;
    if (
      entry.parent === null
        ? node.type !== 'doc'
        : !(CHILDREN[entry.parent] ?? []).includes(node.type)
    )
      return `Invalid child ${node.type} of ${entry.parent ?? 'root'}`;
    if (
      node.type === 'text'
        ? !node.text || node.content !== undefined
        : node.text !== undefined || node.marks !== undefined
    )
      return `Invalid text or marks on ${node.type}`;
    if (!CHILDREN[node.type] && node.content !== undefined)
      return `Leaf ${node.type} cannot have children`;
    if (
      [
        'doc',
        'bulletList',
        'orderedList',
        'listItem',
        'blockquote',
        'table',
        'tableRow',
        'tableCell',
        'tableHeader',
      ].includes(node.type) &&
      !node.content?.length
    )
      return `Expected children for ${node.type}`;
    if (
      node.type === 'listItem' &&
      (node.content?.[0] as { type?: string } | undefined)?.type !== 'paragraph'
    )
      return 'List item must start with paragraph';
    if (node.type === 'table' && (entry.table || (node.content?.length ?? 0) > 100))
      return 'Expected non-nested table of at most 100 rows';
    if (node.type === 'tableRow' && (node.content?.length ?? 0) > 20)
      return 'Expected at most 20 table columns';
    text += node.text?.length ?? 0;
    images += node.type === 'image' ? 1 : 0;
    if (text > DOCUMENT_CONTENT_MAX_TEXT || images > DOCUMENT_CONTENT_MAX_IMAGES)
      return 'Document text or image budget exceeded';
    for (const child of node.content ?? [])
      pending.push({
        value: child,
        depth: entry.depth + 1,
        parent: node.type,
        table: entry.table || node.type === 'table',
      });
  }
  if (utf8Length(JSON.stringify(input)) > DOCUMENT_CONTENT_MAX_BYTES)
    return 'Document JSON byte budget exceeded';
  return null;
}

function normalizedNode(input: unknown): DocumentNodeDto {
  const parsed = nodeShapeDto.parse(input);
  return {
    ...parsed,
    ...(parsed.content ? { content: parsed.content.map(normalizedNode) } : {}),
  } as DocumentNodeDto;
}

/** Validates the closed persisted tree before any recursive parsing. Example: documentContentDto.parse(EMPTY_DOCUMENT_CONTENT). */
export const documentContentDto = z.unknown().transform((input, context): DocumentContentDto => {
  const problem = contentProblem(input);
  if (problem) {
    context.addIssue({ code: 'custom', message: problem });
    return z.NEVER;
  }
  return normalizedNode(input) as DocumentContentDto;
});
