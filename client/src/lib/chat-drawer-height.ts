export const CHAT_DRAWER_DEFAULT_HEIGHT = 440;

export const CHAT_DRAWER_MIN_HEIGHT = 180;

/** The chat drawer height that fits the board: at least 180 px, at most 70% of the board (in whole
 *  pixels). On a board too low for both, the 70% ceiling wins so the map always keeps 30%.
 *
 *  Example: `clampChatDrawerHeight(800, 900)` → `630` */
export function clampChatDrawerHeight(height: number, boardHeight: number): number {
  const ceiling = Math.floor((boardHeight * 7) / 10);
  return Math.min(Math.max(height, CHAT_DRAWER_MIN_HEIGHT), ceiling);
}
