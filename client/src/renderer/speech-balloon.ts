import { worldToScreen, type Camera, type Point } from './camera';
import { tokenWorldRect, type TokenFootprint } from './token-box';
import type { TokenView } from './token-view';

/** How long a line of a character stays over its token. */
export const SPEECH_BALLOON_MS = 4500;

/** The most characters a balloon shows; a longer line ends in "…" (the chat has it whole). */
export const SPEECH_TEXT_MAX = 80;

/** Screen px between the top of the token and the tip of the balloon tail. */
const ANCHOR_GAP = 8;
const ELLIPSIS = '…';

/** A line said as a token on the Mesa conversation, as the room hands it to the board.
 *  `shownAt` is the wall clock (`Date.now()`, ms) when this client got it: the balloon lives
 *  `SPEECH_BALLOON_MS` from there. */
export type SpeechBalloon = Readonly<{
  id: string;
  sceneId: string;
  tokenId: string;
  speakerName: string;
  text: string;
  shownAt: number;
}>;

/** A balloon to draw now: the clipped text and the footprint of the token it hangs over. */
export type ShownSpeech = Readonly<{
  id: string;
  tokenId: string;
  speakerName: string;
  text: string;
  token: TokenFootprint;
}>;

/** What decides which balloons show: the grid on screen, the lines handed over, the tokens of
 *  the view by id (only those this viewer sees) and the wall clock. */
export type SpeechInput = Readonly<{
  sceneId: string;
  balloons: readonly SpeechBalloon[];
  tokens: ReadonlyMap<string, TokenView>;
  nowMs: number;
}>;

/** The line on one row, cut to `SPEECH_TEXT_MAX` characters (code points) with "…".
 *
 *  Example: `clippedSpeechText('Alto lá!\nQuem vem?') // 'Alto lá! Quem vem?'` */
export function clippedSpeechText(text: string): string {
  const characters = Array.from(text.replace(/\s+/g, ' ').trim());
  if (characters.length <= SPEECH_TEXT_MAX) return characters.join('');
  const kept = characters.slice(0, SPEECH_TEXT_MAX - 1).join('');
  return `${kept.trimEnd()}${ELLIPSIS}`;
}

/** Whether the balloon's 4.5 s are over at `nowMs` (a stamp ahead of the clock still shows).
 *
 *  Example: `speechExpired({ ...line, shownAt: 1000 }, 5500) // true` */
export function speechExpired(balloon: SpeechBalloon, nowMs: number): boolean {
  return nowMs - balloon.shownAt >= SPEECH_BALLOON_MS;
}

/** The balloons to draw: alive, of this grid, over a token seen in full (one hidden by vision is
 *  not in the view; a silhouette would give away who speaks), one per token — the newest — and
 *  the oldest first, so the newest is drawn on top.
 *
 *  Example: `shownSpeechOf({ sceneId, balloons, tokens: new Map([[goblin.id, goblin]]), nowMs: Date.now() })` */
export function shownSpeechOf(input: SpeechInput): readonly ShownSpeech[] {
  const newestByToken = new Map<string, SpeechBalloon>();
  for (const balloon of input.balloons) {
    if (!speaksHere(balloon, input)) continue;
    const kept = newestByToken.get(balloon.tokenId);
    if (!kept || balloon.shownAt >= kept.shownAt) newestByToken.set(balloon.tokenId, balloon);
  }
  const newest = [...newestByToken.values()].sort((a, b) => a.shownAt - b.shownAt);
  return newest.flatMap((balloon) => shownOver(balloon, input.tokens.get(balloon.tokenId)));
}

/** Where the tail of the balloon points, in screen px: the top center of the token through the
 *  camera, `ANCHOR_GAP` px above it (the balloon keeps its size at any zoom).
 *
 *  Example: `speechAnchorOf({ col: 2, row: 3, width: 1, height: 1 }, { offsetX: 0, offsetY: 0, zoom: 1 }) // { x: 160, y: 184 }` */
export function speechAnchorOf(token: TokenFootprint, camera: Camera): Point {
  const rect = tokenWorldRect(token);
  const top = worldToScreen(camera, { x: rect.x + rect.width / 2, y: rect.y });
  return { x: top.x, y: top.y - ANCHOR_GAP };
}

function speaksHere(balloon: SpeechBalloon, input: SpeechInput): boolean {
  if (balloon.sceneId !== input.sceneId || speechExpired(balloon, input.nowMs)) return false;
  const token = input.tokens.get(balloon.tokenId);
  return token !== undefined && token.silhouette === null;
}

function shownOver(balloon: SpeechBalloon, token: TokenView | undefined): ShownSpeech[] {
  if (!token) return [];
  const { id, tokenId, speakerName } = balloon;
  const { col, row, width, height } = token;
  const footprint = { col, row, width, height };
  return [{ id, tokenId, speakerName, text: clippedSpeechText(balloon.text), token: footprint }];
}
