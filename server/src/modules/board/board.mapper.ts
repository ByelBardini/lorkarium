import type {
  BoardStateDto,
  BoardViewerDto,
  CombatDto,
  ConditionDefinitionDto,
  DrawingDto,
  EffectAreaDto,
  TokenDto,
  WallDto,
  LightDto,
  VeiledLightDto,
} from '@lorkarium/contracts';
import { toSceneDto } from '../scenes/scenes.mapper';
import type { SceneRow } from '../scenes/scenes.dao';

export type BoardSnapshotParts = Readonly<{
  campaignId: string;
  viewer: BoardViewerDto;
  scene: SceneRow;
  /** Already redacted for the viewer. */
  tokens: readonly TokenDto[];
  drawings: readonly DrawingDto[];
  effectAreas: readonly EffectAreaDto[];
  walls: readonly WallDto[];
  lights: readonly LightDto[];
  /** The lights of the hidden tokens the viewer does not receive. */
  veiledLights: readonly VeiledLightDto[];
  combat: CombatDto | null;
  conditionDefinitions: readonly ConditionDefinitionDto[];
  at: Date;
}>;

/** The parts read for one viewer → the `board:sync` snapshot; the version is the scene's.
 *
 *  Example: `toBoardStateDto({ campaignId, viewer, scene, tokens, at: clock.now() }).version` */
export function toBoardStateDto(parts: BoardSnapshotParts): BoardStateDto {
  return {
    campaignId: parts.campaignId,
    version: parts.scene.version,
    at: parts.at.toISOString(),
    viewer: parts.viewer,
    scene: toSceneDto(parts.scene),
    tokens: [...parts.tokens],
    drawings: [...parts.drawings],
    effectAreas: [...parts.effectAreas],
    walls: [...parts.walls],
    lights: [...parts.lights],
    veiledLights: [...parts.veiledLights],
    combat: parts.combat,
    conditionDefinitions: [...parts.conditionDefinitions],
  };
}
