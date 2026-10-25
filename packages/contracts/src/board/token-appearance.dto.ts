import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { facingDto } from './direction.dto';
import { tokenFrameDto } from './token.dto';
import { tokenAuraDto } from './token-aura.dto';
import { tokenGroupOf, tokenIdGroupDto } from './token-id-group.dto';

const tokenFacingDto = z.strictObject({ tokenId: z.uuid(), facing: facingDto });
export type TokenFacingDto = z.infer<typeof tokenFacingDto>;

/** A turn as sent: `expect` is the facing the token must still have (the undo precondition). */
const tokenFaceDto = tokenFacingDto.extend({
  expect: z.strictObject({ facing: facingDto }).optional(),
});
export type TokenFaceDto = z.infer<typeof tokenFaceDto>;

/** `token:faceMany` (master or a controller who may move the token): all or nothing, one version.
 *  A turn with `expect` is refused with `STALE_UNDO` when the token looks elsewhere.
 *
 *  Example: `faceTokensCommandDto.parse({ actionId, campaignId, faces: [{ tokenId, facing: 45 }] })` */
export const faceTokensCommandDto = z.strictObject({
  ...boardCommandShape,
  faces: tokenGroupOf(tokenFaceDto, (face) => face.tokenId),
});
export type FaceTokensCommandDto = z.infer<typeof faceTokensCommandDto>;

/** `token:facedMany`: the facing is not a secret, so the whole table gets the same event. */
export const tokensFacedDto = z.strictObject({
  ...boardEventShape,
  faces: z.array(tokenFacingDto),
});
export type TokensFacedDto = z.infer<typeof tokensFacedDto>;

/** The look fields to change; an absent field stays, `imageAssetId: null` takes the image away.
 *  `lightLit` lights or puts out the token's light (whoever controls it, like `defeated`), and
 *  `aura: null` takes the aura away.
 *
 *  Example: `tokenStyleDto.parse({ frame: 'round' })` */
export const tokenStyleDto = z
  .strictObject({
    imageAssetId: z.uuid().nullable().optional(),
    frame: tokenFrameDto.optional(),
    flipX: z.boolean().optional(),
    flipY: z.boolean().optional(),
    defeated: z.boolean().optional(),
    lightLit: z.boolean().optional(),
    aura: tokenAuraDto.nullable().optional(),
  })
  .superRefine((style, context) => {
    if (Object.keys(style).length > 0) return;
    context.addIssue({
      code: 'custom',
      message:
        'style is empty; expected at least one of imageAssetId, frame, flipX, flipY, defeated, lightLit, aura',
    });
  });
export type TokenStyleDto = z.infer<typeof tokenStyleDto>;

/** `token:restyleMany` (master or a controller, on any layer): all or nothing, one version.
 *
 *  Example: `restyleTokensCommandDto.parse({ actionId, campaignId, tokenIds: [id], style: { flipX: true } })` */
export const restyleTokensCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenIds: tokenIdGroupDto,
  style: tokenStyleDto,
});
export type RestyleTokensCommandDto = z.infer<typeof restyleTokensCommandDto>;

/** `token:restyledMany`: the look is not a secret, so the whole table gets the same event. */
export const tokensRestyledDto = z.strictObject({
  ...boardEventShape,
  tokenIds: z.array(z.uuid()),
  style: tokenStyleDto,
});
export type TokensRestyledDto = z.infer<typeof tokensRestyledDto>;
