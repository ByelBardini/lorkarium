export const CHAT_DRAWER_DEFAULT_HEIGHT = 330;

export const CHAT_DRAWER_MIN_HEIGHT = 180;

/** The chat drawer height that fits the board: at least 180 px, at most 60% of the board (in whole
 *  pixels). On a board too low for both, the 60% ceiling wins so the map always keeps 40%.
 *
 *  Example: `clampChatDrawerHeight(800, 900)` → `540` */
export function clampChatDrawerHeight(height: number, boardHeight: number): number {
  const ceiling = Math.floor((boardHeight * 3) / 5);
  return Math.min(Math.max(height, CHAT_DRAWER_MIN_HEIGHT), ceiling);
}
