import { Node, type NodeViewRendererProps } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import type { NodeView } from '@tiptap/pm/view';
import { DOCUMENT_IMAGE_MAX_WIDTH, DOCUMENT_IMAGE_MIN_WIDTH } from '@lorkarium/contracts';

const IMAGE_CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
type ImageCorner = (typeof IMAGE_CORNERS)[number];

type ImageResize = {
  pointerId: number;
  x: number;
  y: number;
  width: number;
  heightPerWidth: number;
  corner: ImageCorner;
  preview: number | null;
};

/** Renders protected images with proportional resize handles. Example: `documentImage(assetUrlOf)`. */
export function documentImage(assetUrl: (assetId: string) => string): Node {
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
    renderHTML({ node: { attrs } }) {
      const margin = attrs.align === 'center' ? 'auto' : attrs.align === 'right' ? 'auto 0' : '0';
      return [
        'img',
        {
          src: assetUrl(String(attrs.assetId)),
          alt: attrs.alt ?? '',
          style: `display:block;max-width:100%;height:auto;margin-inline:${margin};${attrs.width ? `width:${Number(attrs.width)}px;` : ''}`,
        },
      ];
    },
    addNodeView() {
      return (props) => createDocumentImageView(props, assetUrl);
    },
  });
}

function createDocumentImageView(
  { node, view, getPos }: NodeViewRendererProps,
  assetUrl: (assetId: string) => string,
): NodeView {
  const doc = view.dom.ownerDocument;
  const row = doc.createElement('div');
  const frame = doc.createElement('div');
  const image = doc.createElement('img');
  row.className = 'document-image';
  frame.className = 'document-image-frame';
  image.src = assetUrl(String(node.attrs.assetId));
  frame.append(image);
  row.append(frame);

  let current = node;
  let resize: ImageResize | null = null;

  function restoreLayout(): void {
    row.dataset.align = current.attrs.align ?? 'left';
    image.alt = current.attrs.alt ?? '';
    image.style.width = current.attrs.width ? `${Number(current.attrs.width)}px` : '';
  }

  function beginResize(event: PointerEvent, corner: ImageCorner, handle: HTMLElement): void {
    if (resize || event.button !== 0 || !view.editable || !image.naturalWidth) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    resize = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: image.getBoundingClientRect().width,
      heightPerWidth: image.naturalHeight / image.naturalWidth,
      corner,
      preview: null,
    };
  }

  function previewResize(event: PointerEvent): void {
    if (resize?.pointerId !== event.pointerId) return;
    const width = draggedWidth(resize, event, row.clientWidth);
    resize.preview = width;
    image.style.width = `${width}px`;
  }

  function finishResize(event: PointerEvent): void {
    if (resize?.pointerId !== event.pointerId) return;
    const { preview, width } = resize;
    resize = null;
    restoreLayout();
    const pos = getPos();
    if (event.type !== 'pointerup' || !view.editable || pos === undefined) return;
    if (preview === null || preview === Math.round(width)) return;
    const transaction = view.state.tr.setNodeMarkup(pos, undefined, {
      ...current.attrs,
      width: preview,
    });
    view.dispatch(transaction.setSelection(NodeSelection.create(transaction.doc, pos)));
  }

  for (const corner of IMAGE_CORNERS) {
    const handle = doc.createElement('span');
    handle.dataset.imageResizeCorner = corner;
    handle.setAttribute('aria-hidden', 'true');
    handle.addEventListener('pointerdown', (event) => beginResize(event, corner, handle));
    frame.append(handle);
  }
  frame.addEventListener('pointermove', previewResize);
  frame.addEventListener('pointerup', finishResize);
  frame.addEventListener('pointercancel', finishResize);
  frame.addEventListener('lostpointercapture', finishResize);
  restoreLayout();

  return {
    dom: row,
    stopEvent: (event) =>
      event.target instanceof doc.defaultView!.HTMLElement &&
      event.target.hasAttribute('data-image-resize-corner'),
    ignoreMutation: (mutation) => mutation.type !== 'selection',
    update: (next) => {
      if (next.type !== current.type || next.attrs.assetId !== current.attrs.assetId) return false;
      if (next.eq(current)) return true;
      current = next;
      resize = null;
      restoreLayout();
      return true;
    },
  };
}

function draggedWidth(resize: ImageResize, pointer: PointerEvent, available: number): number {
  const { x, y, width, corner, heightPerWidth } = resize;
  const dx = (pointer.clientX - x) * (corner.endsWith('right') ? 1 : -1);
  const dy = (pointer.clientY - y) * (corner.startsWith('bottom') ? 1 : -1);
  const delta = (dx + dy * heightPerWidth) / (1 + heightPerWidth ** 2);
  const maxWidth = Math.max(
    DOCUMENT_IMAGE_MIN_WIDTH,
    Math.min(DOCUMENT_IMAGE_MAX_WIDTH, available),
  );
  return Math.min(maxWidth, Math.max(DOCUMENT_IMAGE_MIN_WIDTH, Math.round(width + delta)));
}
