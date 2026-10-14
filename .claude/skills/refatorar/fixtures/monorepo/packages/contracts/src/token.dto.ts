import { z } from 'zod';
import { cellOf } from '@fixture/game-core';

export const tokenMoveSchema = z.object({ tokenId: z.string(), x: z.number(), y: z.number() });

export type TokenDto = { id: string; sceneId: string; x: number; y: number };

export function snapMove(x: number): number {
  return cellOf(x, 50).column;
}
