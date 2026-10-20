import type { TokenSideDto } from '@lorkarium/contracts';

// The same tones as RING_COLOR in pixi-token-layer.ts, which keeps the hex for the canvas.
const RING_VAR: Readonly<Record<TokenSideDto, string>> = {
  ally: 'var(--label)',
  enemy: 'var(--chart-3)',
  neutral: 'var(--chart-2)',
};

/** The color of a token's ring in the DOM, by side, as a CSS variable for an inline `style`.
 *
 *  Example: `<span style={{ boxShadow: `0 0 0 3px ${sideRingVar('enemy')}` }} />` */
export function sideRingVar(side: TokenSideDto): string {
  return RING_VAR[side];
}
