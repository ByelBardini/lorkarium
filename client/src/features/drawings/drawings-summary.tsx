import type { DrawingDto } from '@lorkarium/contracts';
import type { StoreApi } from 'zustand/vanilla';
import { DRAWING_KINDS } from '@/lib/drawing-style';
import { useBoard, type BoardStore } from '@/stores/board-store';

export type DrawingsSummaryProps = Readonly<{ board: StoreApi<BoardStore> }>;

const NO_DRAWINGS: readonly DrawingDto[] = [];

/** The drawings of the scene in words, for whoever cannot see the canvas: its shape and the cell
 *  of its corner (counted from 1). Hidden on screen.
 *
 *  Example: `<DrawingsSummary board={board} />` */
export function DrawingsSummary({ board }: DrawingsSummaryProps): React.JSX.Element {
  const drawings = useBoard(board, (state) => state.board?.drawings ?? NO_DRAWINGS);
  return (
    <ul aria-label="Desenhos na cena" className="sr-only">
      {drawings.map((drawing) => (
        <li key={drawing.id}>{describeDrawing(drawing)}</li>
      ))}
    </ul>
  );
}

function describeDrawing(drawing: DrawingDto): string {
  const kind = DRAWING_KINDS.find((entry) => entry.kind === drawing.kind)?.label ?? drawing.kind;
  const where = `coluna ${Math.floor(drawing.x) + 1}, linha ${Math.floor(drawing.y) + 1}`;
  return `${kind}, ${where}`;
}
