import type { SceneSize } from './grid';
import type { TokenBox } from './token-resize';
import { tokenSize, type TokenSize } from './token-size.vo';

/** The box of a token after it takes a form of `size`: the top-left corner stays and steps back
 *  into the scene only as far as the new size needs. Walls and other tokens are not checked
 *  (collision is spec §12, as in resizing).
 *
 *  Example: `formBoxIn({ widthCells: 10, heightCells: 10 }, { col: 9, row: 4, width: 1, height: 1 }, { width: 2, height: 2 })` → `{ col: 8, row: 4, width: 2, height: 2 }` */
export function formBoxIn(scene: SceneSize, box: TokenBox, size: TokenSize): TokenBox {
  const { width, height } = tokenSize(size.width, size.height);
  if (width > scene.widthCells || height > scene.heightCells) {
    throw new RangeError(
      `Form ${String(width)}×${String(height)} does not fit the scene ${String(scene.widthCells)}×${String(scene.heightCells)}: expected both sides within the scene.`,
    );
  }
  const col = Math.min(box.col, scene.widthCells - width);
  const row = Math.min(box.row, scene.heightCells - height);
  return { col, row, width, height };
}
