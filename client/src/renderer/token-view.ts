import type {
  BarColorDto,
  ConditionColorDto,
  ConditionIconDto,
  ConditionLookDto,
  ConditionToneDto,
  TokenDto,
  TokenFrameDto,
  TokenLayerDto,
  TokenSideDto,
} from '@lorkarium/contracts';
import type { Cell, TokenBox } from '@lorkarium/game-core';
import { barFill, type BarFill } from '@/lib/bar-display';
import { levelOf, type BoardSight } from '@/lib/board-sight';
import { tokenLooksOf } from '@/lib/condition-order';
import { shownStacksOf } from '@/lib/condition-stacks';
import { assetUrlOf } from '@/services/assets-api';

/** The image of a token; `null` keeps the initials disc. Not a secret: every viewer gets it. */
export type TokenArtView = Readonly<{
  url: string;
  frame: TokenFrameDto;
  flipX: boolean;
  flipY: boolean;
}>;

/** The bar drawn under a token: always the one at position 0, when the viewer may see it. */
export type TokenBarView = BarFill & Readonly<{ color: BarColorDto }>;

/** A condition drawn on a token: its icon in its color (`null`: its tone's), the rounds it has
 *  left (`null`: until removed) and its stacks (`null`: it does not stack). */
export type ConditionMarkView = Readonly<{
  icon: ConditionIconDto;
  tone: ConditionToneDto;
  color: ConditionColorDto | null;
  remainingRounds: number | null;
  stacks: number | null;
}>;

export type TokenView = Readonly<{
  id: string;
  /** Shown under the token, to everyone, while it is hovered or selected. */
  name: string;
  initials: string;
  ring: TokenSideDto;
  col: number;
  row: number;
  width: number;
  height: number;
  bar: TokenBarView | null;
  layer: TokenLayerDto;
  /** On the active layer: a click or a marquee may take it. */
  pickable: boolean;
  selected: boolean;
  draggable: boolean;
  /** The token of the combatant on turn: the gold ring. */
  onTurn: boolean;
  /** Every condition that is only an icon, the heaviest first; the strip decides how many fit. */
  conditions: readonly ConditionMarkView[];
  /** How its conditions change the token itself (translucent, greyed out), each once. */
  looks: readonly ConditionLookDto[];
  art: TokenArtView | null;
  /** Where it looks (0 = right, clockwise): the image and the mark on the border turn with it. */
  facing: number;
  /** The mark on the border: only creatures (tokens layer) look somewhere; a chest just turns. */
  facingMark: boolean;
  /** A fallen foe: the red cross over a dimmed token, for every viewer. */
  defeated: boolean;
  /** In the penumbra of this viewer: a black shape of the footprint (round or square), and
   *  nothing else. `null` when it is seen. */
  silhouette: 'round' | 'square' | null;
}>;

/** What the tokens of a view are built from (a part of the `BoardViewInput`). */
export type TokenViewInput = Readonly<{
  tokens: readonly TokenDto[];
  /** What this viewer sees (absent: everything). */
  sight?: BoardSight;
  selectedTokenIds: readonly string[];
  activeLayer: TokenLayerDto;
  /** A turn of this viewer waiting for the server, by token id. */
  facingPreview: Readonly<Record<string, number>>;
  /** A resize of this viewer waiting for the server (or being dragged), by token id. */
  resizePreview: Readonly<Record<string, TokenBox>>;
  /** Where other people are dragging tokens, by id. */
  dragged: Readonly<Record<string, Cell>>;
  /** Reconnecting: nothing is draggable. */
  readOnly: boolean;
  /** The tokens of the entry on turn in the combat; none out of combat. */
  currentTokenIds: readonly string[];
}>;

/** The tokens as drawn, bottom layer first, through the sight filter: hidden tokens are not
 *  drawn, those in the penumbra become silhouettes.
 *
 *  Example: `tokenViewsOf({ tokens, selectedTokenIds, activeLayer: 'tokens', … })[0]?.pickable` */
export function tokenViewsOf(input: TokenViewInput): TokenView[] {
  const { sight } = input;
  return inDrawingOrder(input.tokens).flatMap((token) => {
    const view = tokenViewOf(token, input);
    const level = sight ? levelOf(sight, token.id) : 'seen';
    if (level === 'hidden') return [];
    return level === 'silhouette' ? [silhouetteOf(view, token)] : [view];
  });
}

function silhouetteOf(view: TokenView, token: TokenDto): TokenView {
  return {
    ...view,
    silhouette: token.frame === 'round' ? 'round' : 'square',
    name: '',
    initials: '',
    bar: null,
    conditions: [],
    looks: [],
    art: null,
    facingMark: false,
    defeated: false,
    onTurn: false,
    pickable: false,
    draggable: false,
    selected: false,
  };
}

function tokenViewOf(token: TokenDto, input: TokenViewInput): TokenView {
  const first = token.bars.find(({ position }) => position === 0);
  const box = input.resizePreview[token.id];
  const at = box ?? input.dragged[token.id] ?? token;
  const pickable = token.layer === input.activeLayer;
  return {
    id: token.id,
    name: token.name,
    initials: token.initials,
    ring: token.side,
    col: at.col,
    row: at.row,
    width: box?.width ?? token.width,
    height: box?.height ?? token.height,
    bar: first ? { ...barFill(first), color: first.color } : null,
    layer: token.layer,
    pickable,
    selected: input.selectedTokenIds.includes(token.id),
    draggable: pickable && token.canControl && !input.readOnly,
    onTurn: input.currentTokenIds.includes(token.id),
    ...conditionsOf(token),
    art: artOf(token),
    facing: input.facingPreview[token.id] ?? token.facing,
    facingMark: token.layer === 'tokens',
    defeated: token.defeated,
    silhouette: null,
  };
}

function conditionsOf(token: TokenDto): Pick<TokenView, 'conditions' | 'looks'> {
  const { looks, marks } = tokenLooksOf(token.conditions);
  const conditions = marks.map((mark) => ({
    icon: mark.icon,
    tone: mark.tone,
    color: mark.color,
    remainingRounds: mark.remainingRounds,
    stacks: shownStacksOf(mark),
  }));
  return { conditions, looks };
}

function artOf(token: TokenDto): TokenArtView | null {
  if (token.imageAssetId === null) return null;
  const { frame, flipX, flipY } = token;
  return { url: assetUrlOf(token.imageAssetId), frame, flipX, flipY };
}

// Bottom first: what is drawn later covers it. `toSorted` keeps the list order inside a layer.
const DRAWING_RANK: Readonly<Record<TokenLayerDto, number>> = {
  background: 0,
  objects: 1,
  tokens: 2,
};

function inDrawingOrder(tokens: readonly TokenDto[]): TokenDto[] {
  return tokens.toSorted((a, b) => DRAWING_RANK[a.layer] - DRAWING_RANK[b.layer]);
}
