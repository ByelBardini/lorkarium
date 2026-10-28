import { BOARD_EVENTS } from '@lorkarium/contracts';
import type { TokenBox } from '@lorkarium/game-core';
import type { TokenFormTarget, TokenResizeTarget, TokenStyle } from './board-command-targets';
import type { BoardCommandResult, BoardCommandSender, BoardScope } from './board-command-sender';

/** The commands that change how tokens look on the grid: the box, the style and the form (the
 *  master or the controllers). Each answers with its ack, never throws.
 *
 *  Example: `await commands.setTokenForm(scope, { tokenId, formId: wolfId })` */
export interface TokenAppearanceCommands {
  /** Sizes and origins after the handles (`token:resizeMany`); the controllers' to choose. */
  resizeTokens(
    scope: BoardScope,
    resizes: readonly TokenResizeTarget[],
  ): Promise<BoardCommandResult>;
  /** Changes the look of a group (master or controllers), all or nothing in one version. */
  restyleTokens(
    scope: BoardScope,
    tokenIds: readonly string[],
    style: TokenStyle,
  ): Promise<BoardCommandResult>;
  /** The token takes the image and the size of one of its forms (`token:setForm`). */
  setTokenForm(scope: BoardScope, target: TokenFormTarget): Promise<BoardCommandResult>;
}

/** `TokenAppearanceCommands` over the board command sender.
 *
 *  Example: `new RealtimeTokenAppearanceCommands(sender).setTokenForm(scope, { tokenId, formId })` */
export class RealtimeTokenAppearanceCommands implements TokenAppearanceCommands {
  constructor(private readonly sender: BoardCommandSender) {}

  resizeTokens(
    scope: BoardScope,
    resizes: readonly TokenResizeTarget[],
  ): Promise<BoardCommandResult> {
    const boxes = resizes.map(({ tokenId, col, row, width, height, expect }) => ({
      tokenId,
      col,
      row,
      width,
      height,
      ...(expect && { expect: boxOf(expect) }),
    }));
    return this.sender.send(BOARD_EVENTS.resizeTokens, scope, { resizes: boxes });
  }

  restyleTokens(
    scope: BoardScope,
    tokenIds: readonly string[],
    style: TokenStyle,
  ): Promise<BoardCommandResult> {
    return this.sender.send(BOARD_EVENTS.restyleTokens, scope, {
      tokenIds: [...tokenIds],
      style: { ...style },
    });
  }

  setTokenForm(scope: BoardScope, target: TokenFormTarget): Promise<BoardCommandResult> {
    const { tokenId, formId, expect } = target;
    const precondition = expect && { expect: { activeFormId: expect.activeFormId } };
    return this.sender.send(BOARD_EVENTS.setTokenForm, scope, {
      tokenId,
      formId,
      ...precondition,
    });
  }
}

function boxOf({ col, row, width, height }: TokenBox): TokenBox {
  return { col, row, width, height };
}
