import type { EffectAreaDto, SceneDto, SessionMemberDto } from '@lorkarium/contracts';
import { facingVector } from '@lorkarium/game-core';
import type { StoreApi } from 'zustand/vanilla';
import { DRAWING_COLORS } from '@/lib/drawing-style';
import { effectAreaSize } from '@/lib/effect-area-label';
import { shapeOfEffectArea } from '@/lib/effect-area-shape';
import { effectAreaKindLabel } from '@/lib/effect-area-style';
import { useBoard, type BoardStore } from '@/stores/board-store';
import { useTablePresence, type TablePresenceStore } from '@/stores/table-presence-store';

export type EffectAreasSummaryProps = Readonly<{
  board: StoreApi<BoardStore>;
  presence: StoreApi<TablePresenceStore>;
}>;

const NO_AREAS: readonly EffectAreaDto[] = [];
const NO_MEMBERS: readonly SessionMemberDto[] = [];

/** The areas of effect of the scene in words, for whoever cannot see the canvas: the shape, the
 *  color, the size, the author and the cell it leaves from (counted from 1). Hidden on screen.
 *
 *  Example: `<EffectAreasSummary board={board} presence={presence} />` */
export function EffectAreasSummary({
  board,
  presence,
}: EffectAreasSummaryProps): React.JSX.Element {
  const areas = useBoard(board, (state) => state.board?.effectAreas ?? NO_AREAS);
  const scene = useBoard(board, (state) => state.board?.scene ?? null);
  const members = useTablePresence(presence, (state) => state.members ?? NO_MEMBERS);
  return (
    <ul aria-label="Áreas na cena" className="sr-only">
      {scene && areas.map((area) => <li key={area.id}>{describeArea(area, scene, members)}</li>)}
    </ul>
  );
}

function describeArea(
  area: EffectAreaDto,
  scene: SceneDto,
  members: readonly SessionMemberDto[],
): string {
  const color = DRAWING_COLORS.find((entry) => entry.color === area.color)?.label ?? area.color;
  const size = effectAreaSize(shapeOfEffectArea(area), scene);
  const author = members.find(({ userId }) => userId === area.authorId)?.name;
  const by = author ? `de ${author}` : 'sem autor';
  const { col, row } = sourceCellOf(area);
  return `${effectAreaKindLabel(area.kind)}, ${color}, ${size}, ${by}, coluna ${col + 1}, linha ${row + 1}`;
}

// A shape that points somewhere leaves a cell behind its origin: step half a cell back to it.
function sourceCellOf(area: EffectAreaDto): Readonly<{ col: number; row: number }> {
  const back = 'facing' in area ? facingVector(area.facing) : { x: 0, y: 0 };
  return { col: Math.floor(area.x - back.x / 2), row: Math.floor(area.y - back.y / 2) };
}
