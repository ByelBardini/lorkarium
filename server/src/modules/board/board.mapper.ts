import type {
  BoardStateDto,
  BoardViewerDto,
  CombatDto,
  ConditionDefinitionDto,
  DrawingDto,
  TokenDto,
} from '@lorkarium/contracts';
import { toSceneDto } from '../scenes/scenes.mapper';
import type { ScenePo } from '../scenes/scenes.po';

export type BoardSnapshotParts = Readonly<{
  campaignId: string;
  viewer: BoardViewerDto;
  scene: ScenePo;
  /** Already redacted for the viewer. */
  tokens: readonly TokenDto[];
  drawings: readonly DrawingDto[];
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
    combat: parts.combat,
    conditionDefinitions: [...parts.conditionDefinitions],
  };
}
