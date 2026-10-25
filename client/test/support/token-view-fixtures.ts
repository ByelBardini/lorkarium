import type { TokenView } from '@/renderer/token-view';

/** A seen 1 × 1 goblin at (`col`, 0) on the Tokens layer, with PV at 7 of 10.
 *
 *  Example: `goblinView({ id: 'g2', col: 3, selected: true })` */
export function goblinView(overrides: Partial<TokenView> = {}): TokenView {
  return {
    id: 'goblin',
    name: 'Goblin',
    initials: 'GO',
    ring: 'enemy',
    col: 0,
    row: 0,
    width: 1,
    height: 1,
    bar: { fraction: 0.7, state: 'normal', excess: 0, color: 'ember' },
    layer: 'tokens',
    pickable: true,
    selected: false,
    draggable: true,
    onTurn: false,
    conditions: [],
    looks: [],
    art: null,
    facing: 0,
    facingMark: true,
    defeated: false,
    hidden: false,
    silhouette: null,
    aura: null,
    ...overrides,
  };
}
