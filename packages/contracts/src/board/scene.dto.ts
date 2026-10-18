import { z } from 'zod';

export const SCENE_CELLS_MIN = 1;
export const SCENE_CELLS_MAX = 100;
export const CELL_UNIT_MAX_LENGTH = 8;
export const CELL_DISTANCE_MAX = 9999;
export const GRID_OPACITY_MAX = 100;

const sceneCellsDto = z.number().int().min(SCENE_CELLS_MIN).max(SCENE_CELLS_MAX);

/** Grid settings the master configures (spec §3.2: the scene is only the grid for now). */
const sceneGridShape = {
  widthCells: sceneCellsDto,
  heightCells: sceneCellsDto,
  cellDistance: z.number().positive().max(CELL_DISTANCE_MAX),
  cellUnit: z.string().trim().min(1).max(CELL_UNIT_MAX_LENGTH),
  gridVisible: z.boolean(),
  gridOpacity: z.number().int().min(0).max(GRID_OPACITY_MAX),
};

/** The background image stretched over the whole scene; `width`/`height` are the image's pixels
 *  (the client derives the proportion from them). */
export const sceneBackgroundDto = z.strictObject({
  assetId: z.uuid(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type SceneBackgroundDto = z.infer<typeof sceneBackgroundDto>;

/** The active scene of a campaign.
 *
 *  Example: `sceneDto.parse(state.scene).widthCells // 20` */
export const sceneDto = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  ...sceneGridShape,
  background: sceneBackgroundDto.nullable(),
});

export type SceneDto = z.infer<typeof sceneDto>;

/** Payload of `scene:configure`, sent by the master; who asks comes from the connection.
 *  `backgroundAssetId`: an asset of the campaign sets the background, `null` takes it away, absent
 *  keeps it.
 *
 *  Example: `configureSceneCommandDto.parse({ actionId, campaignId, ...grid })` */
export const configureSceneCommandDto = z.strictObject({
  actionId: z.uuid(),
  campaignId: z.uuid(),
  ...sceneGridShape,
  backgroundAssetId: z.uuid().nullable().optional(),
});

export type ConfigureSceneCommandDto = z.infer<typeof configureSceneCommandDto>;
export type ConfigureSceneCommandInput = z.input<typeof configureSceneCommandDto>;

/** The grid fields alone: the client form validates with this, the server receives them inside
 *  `configureSceneCommandDto`.
 *
 *  Example: `sceneGridDto.safeParse(formValues).error?.issues[0]?.path // ['widthCells']` */
export const sceneGridDto = z.strictObject(sceneGridShape);

export type SceneGridDto = z.infer<typeof sceneGridDto>;
