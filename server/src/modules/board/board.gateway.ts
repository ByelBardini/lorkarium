import {
  activateSceneCommandDto,
  addCombatantsCommandDto,
  adjustBarCommandDto,
  applyConditionCommandDto,
  applyConditionsCommandDto,
  boardCommandDto,
  configureSceneCommandDto,
  createDrawingsCommandDto,
  createEffectAreasCommandDto,
  createTokenCommandDto,
  createTokensCommandDto,
  createWallsCommandDto,
  createLightsCommandDto,
  deleteLightsCommandDto,
  moveLightsCommandDto,
  setLightColorsCommandDto,
  setLightConesCommandDto,
  setLightRangesCommandDto,
  setLightsLitCommandDto,
  defineConditionCommandDto,
  deleteDrawingsCommandDto,
  deleteEffectAreasCommandDto,
  deleteTokenCommandDto,
  deleteTokensCommandDto,
  deleteWallsCommandDto,
  eraseWallAreaCommandDto,
  eraseWallSegmentCommandDto,
  dragTokensCommandDto,
  pingCommandDto,
  endCombatCommandDto,
  moveDrawingsCommandDto,
  moveInTieCommandDto,
  moveTokenCommandDto,
  moveTokensCommandDto,
  moveWallsCommandDto,
  nextTurnCommandDto,
  previousTurnCommandDto,
  regroupTokensCommandDto,
  removeCombatantCommandDto,
  removeConditionCommandDto,
  setConditionRoundsCommandDto,
  setConditionStacksCommandDto,
  renameCombatantCommandDto,
  reshapeEffectAreasCommandDto,
  setInitiativeCommandDto,
  setDoorCommandDto,
  setTokenLayerCommandDto,
  setTokensHiddenCommandDto,
  setWallKindsCommandDto,
  faceTokensCommandDto,
  restyleTokensCommandDto,
  resizeTokensCommandDto,
  setTokenFormCommandDto,
  setMainTokenCommandDto,
  startCombatCommandDto,
  updateTokenCommandDto,
  updateMemberCardCommandDto,
  watchSceneCommandDto,
  type BoardSyncAckDto,
} from '@lorkarium/contracts';
import type { FastifyBaseLogger } from 'fastify';
import type { z } from 'zod';
import type { CampaignCommandQueue } from '../../realtime/campaign-command-queue';
import type { CommandRateGuard } from '../../realtime/command-rate-guard';
import type { Realtime, RealtimeSocket } from '../../realtime/realtime-server';
import type { CombatService } from '../combat/combat.service';
import type { ConditionsService } from '../conditions/conditions.service';
import type { DrawingsService } from '../drawings/drawings.service';
import type { EffectAreasService } from '../effect-areas/effect-areas.service';
import type { MemberCardsService } from '../member-cards/member-cards.service';
import type { PingsService } from '../pings/pings.service';
import { toSceneGrid } from '../scenes/scenes.mapper';
import type { CreatedInScene } from '../scenes/locked-scene';
import type { SceneActivationService } from '../scenes/scene-activation.service';
import type { SceneWatchService } from '../scenes/scene-watch.service';
import type { ScenesService } from '../scenes/scenes.service';
import type { TokenAppearanceService } from '../tokens/token-appearance.service';
import type { TokenFormService } from '../tokens/token-form.service';
import type { TokenVisibilityService } from '../tokens/token-visibility.service';
import type { MainTokenService } from '../tokens/main-token.service';
import type { TokenBatchService } from '../tokens/token-batch.service';
import type { TokenLinkService } from '../tokens/token-link.service';
import type { TokensService } from '../tokens/tokens.service';
import type { LightsService } from '../lights/lights.service';
import type { WallsService } from '../walls/walls.service';
import type { BoardService } from './board.service';
import {
  onCommand,
  versionOf,
  type CampaignCommand,
  type CommandOk,
  type Handler,
} from './board-command-edge';
import { bindCharacterCommands } from './character-commands';
import {
  bindConditionCatalogCommands,
  type ConditionCatalogCommandsDeps,
} from './condition-catalog-commands';
import { unwatchGrid, watchGrid } from './grid-tabs';

export type BoardGatewayDeps = Readonly<{
  board: BoardService;
  scenes: Pick<ScenesService, 'configure'>;
  sceneWatch: Pick<SceneWatchService, 'watch' | 'groupSceneIdOf'>;
  sceneActivation: Pick<SceneActivationService, 'activate'>;
  tokens: Pick<
    TokensService,
    'create' | 'update' | 'move' | 'moveMany' | 'dragMany' | 'setLayer' | 'adjustBar' | 'delete'
  >;
  tokenBatch: Pick<TokenBatchService, 'createMany' | 'deleteMany' | 'addPlayers'>;
  tokenAppearance: Pick<TokenAppearanceService, 'faceMany' | 'restyleMany' | 'resizeMany'>;
  tokenForm: Pick<TokenFormService, 'setForm'>;
  mainToken: Pick<MainTokenService, 'choose'>;
  tokenVisibility: Pick<TokenVisibilityService, 'setHiddenMany'>;
  tokenLink: Pick<TokenLinkService, 'link' | 'unlink'>;
  memberCards: Pick<MemberCardsService, 'update'>;
  pings: Pick<PingsService, 'ping'>;
  conditions: Pick<
    ConditionsService,
    'define' | 'apply' | 'applyMany' | 'remove' | 'setRounds' | 'setStacks'
  >;
  conditionCatalog: ConditionCatalogCommandsDeps['conditionCatalog'];
  combat: Pick<
    CombatService,
    | 'start'
    | 'end'
    | 'addCombatants'
    | 'removeCombatant'
    | 'regroupTokens'
    | 'renameCombatant'
    | 'moveInTie'
    | 'setInitiative'
    | 'nextTurn'
    | 'previousTurn'
  >;
  drawings: Pick<DrawingsService, 'createMany' | 'moveMany' | 'deleteMany'>;
  effectAreas: Pick<EffectAreasService, 'createMany' | 'reshapeMany' | 'deleteMany'>;
  walls: Pick<
    WallsService,
    | 'createMany'
    | 'moveMany'
    | 'deleteMany'
    | 'setKindMany'
    | 'setDoor'
    | 'eraseSegment'
    | 'eraseArea'
  >;
  lights: Pick<
    LightsService,
    | 'createMany'
    | 'moveMany'
    | 'setRangeMany'
    | 'setColorMany'
    | 'setConeMany'
    | 'setLitMany'
    | 'deleteMany'
  >;
  realtime: Pick<Realtime, 'reauthenticate'>;
  /** The bucket of each connection, shared with the sessions gateway. */
  rate: CommandRateGuard;
  /** Commands that write to a table wait here, one at a time per table. */
  queue: CampaignCommandQueue;
  log: FastifyBaseLogger;
}>;

// The service reads the payload fields; the envelope (actionId, campaignId) rides along unread.
type Mutation<Command> = (userId: string, campaignId: string, command: Command) => Promise<number>;
type Creation<Command> = (
  userId: string,
  campaignId: string,
  command: Command,
) => Promise<CreatedInScene>;

/** Socket.IO edge of the board (scene and tokens): validates the command, re-reads the session,
 *  requires the table to be open on this connection, delegates and answers in the ack with the
 *  version it produced. Events go out by the publisher, after the commit.
 *
 *  Example: `realtime.onConnection(createBoardGateway({ board, scenes, tokens, realtime, log }))` */
export function createBoardGateway(deps: BoardGatewayDeps): (socket: RealtimeSocket) => void {
  const { tokens, tokenBatch, tokenAppearance: appearance, conditions, combat, drawings } = deps;
  const { effectAreas, walls, lights, mainToken, memberCards, tokenVisibility } = deps;
  const { rate, tokenForm } = deps;
  return (socket) => {
    const bind = <C extends CampaignCommand, A>(schema: z.ZodType<C>, handler: Handler<C, A>) =>
      onCommand({ deps, rate, socket }, schema, handler);
    // Every command that writes waits for the table's queue; sync and the drag preview do not.
    const write = <C extends CampaignCommand, A>(schema: z.ZodType<C>, handler: Handler<C, A>) =>
      bind(schema, (userId, command: C) =>
        deps.queue.run(command.campaignId, () => handler(userId, command)),
      );
    socket.on(
      'board:sync',
      bind(boardCommandDto, async (userId, { campaignId, sceneId }) => {
        const state = await deps.board.snapshotFor(userId, campaignId, sceneId);
        return { ok: true, state } satisfies Extract<BoardSyncAckDto, { ok: true }>;
      }),
    );
    socket.on(
      'scene:watch',
      bind(watchSceneCommandDto, (userId, command) => watchGrid(deps, socket, userId, command)),
    );
    socket.on(
      'scene:unwatch',
      bind(watchSceneCommandDto, (userId, command) => unwatchGrid(deps, socket, userId, command)),
    );
    socket.on(
      'scene:activate',
      write(activateSceneCommandDto, async (userId, { campaignId, sceneId }) => {
        await deps.sceneActivation.activate(userId, campaignId, sceneId);
        return { ok: true } as const;
      }),
    );
    socket.on(
      'scene:configure',
      write(configureSceneCommandDto, (userId, command) =>
        versionOf(
          deps.scenes.configure(userId, command.campaignId, {
            grid: toSceneGrid(command),
            backgroundAssetId: command.backgroundAssetId,
            vision: command.vision,
            sceneId: command.sceneId,
          }),
        ),
      ),
    );
    const mutate = <C extends CampaignCommand>(schema: z.ZodType<C>, run: Mutation<C>) =>
      write(schema, (userId, command) => versionOf(run(userId, command.campaignId, command)));
    // A creating batch also answers the ids it gave: the sender's undo needs them.
    const create = <C extends CampaignCommand>(schema: z.ZodType<C>, run: Creation<C>) =>
      write(schema, async (userId, command): Promise<CommandOk> => {
        const { version, createdIds } = await run(userId, command.campaignId, command);
        return { ok: true, version, createdIds };
      });
    socket.on('token:create', mutate(createTokenCommandDto, tokens.create.bind(tokens)));
    socket.on('token:update', mutate(updateTokenCommandDto, tokens.update.bind(tokens)));
    socket.on('token:move', mutate(moveTokenCommandDto, tokens.move.bind(tokens)));
    socket.on('token:moveMany', mutate(moveTokensCommandDto, tokens.moveMany.bind(tokens)));
    socket.on(
      'token:dragMany',
      bind(dragTokensCommandDto, (userId, command) =>
        versionOf(tokens.dragMany(userId, command.campaignId, command, socket.id)),
      ),
    );
    // The ping writes nothing: it skips the table's queue, like the drag preview.
    socket.on(
      'board:ping',
      bind(pingCommandDto, async (userId, command) => {
        await deps.pings.ping(userId, command.campaignId, command, socket.id);
        return { ok: true } as const;
      }),
    );
    socket.on('token:setLayer', mutate(setTokenLayerCommandDto, tokens.setLayer.bind(tokens)));
    socket.on('token:faceMany', mutate(faceTokensCommandDto, appearance.faceMany.bind(appearance)));
    socket.on(
      'token:restyleMany',
      mutate(restyleTokensCommandDto, appearance.restyleMany.bind(appearance)),
    );
    socket.on(
      'token:resizeMany',
      mutate(resizeTokensCommandDto, appearance.resizeMany.bind(appearance)),
    );
    socket.on('token:setForm', mutate(setTokenFormCommandDto, tokenForm.setForm.bind(tokenForm)));
    socket.on('token:adjustBar', mutate(adjustBarCommandDto, tokens.adjustBar.bind(tokens)));
    socket.on('token:setMain', mutate(setMainTokenCommandDto, mainToken.choose.bind(mainToken)));
    socket.on(
      'token:setHiddenMany',
      mutate(setTokensHiddenCommandDto, tokenVisibility.setHiddenMany.bind(tokenVisibility)),
    );
    socket.on(
      'member:updateCard',
      mutate(updateMemberCardCommandDto, memberCards.update.bind(memberCards)),
    );
    socket.on('token:delete', mutate(deleteTokenCommandDto, tokens.delete.bind(tokens)));
    bindCharacterCommands(socket, { mutate, write }, deps);
    socket.on(
      'token:createMany',
      create(createTokensCommandDto, tokenBatch.createMany.bind(tokenBatch)),
    );
    socket.on(
      'token:deleteMany',
      mutate(deleteTokensCommandDto, tokenBatch.deleteMany.bind(tokenBatch)),
    );
    socket.on(
      'drawing:createMany',
      create(createDrawingsCommandDto, drawings.createMany.bind(drawings)),
    );
    socket.on('drawing:moveMany', mutate(moveDrawingsCommandDto, drawings.moveMany.bind(drawings)));
    socket.on(
      'drawing:deleteMany',
      mutate(deleteDrawingsCommandDto, drawings.deleteMany.bind(drawings)),
    );
    socket.on(
      'effectArea:createMany',
      create(createEffectAreasCommandDto, effectAreas.createMany.bind(effectAreas)),
    );
    socket.on(
      'effectArea:reshapeMany',
      mutate(reshapeEffectAreasCommandDto, effectAreas.reshapeMany.bind(effectAreas)),
    );
    socket.on(
      'effectArea:deleteMany',
      mutate(deleteEffectAreasCommandDto, effectAreas.deleteMany.bind(effectAreas)),
    );
    socket.on('wall:createMany', create(createWallsCommandDto, walls.createMany.bind(walls)));
    socket.on('wall:moveMany', mutate(moveWallsCommandDto, walls.moveMany.bind(walls)));
    socket.on('wall:deleteMany', mutate(deleteWallsCommandDto, walls.deleteMany.bind(walls)));
    socket.on('wall:setKindMany', mutate(setWallKindsCommandDto, walls.setKindMany.bind(walls)));
    socket.on('wall:setDoor', mutate(setDoorCommandDto, walls.setDoor.bind(walls)));
    socket.on(
      'wall:eraseSegment',
      create(eraseWallSegmentCommandDto, walls.eraseSegment.bind(walls)),
    );
    socket.on('wall:eraseArea', create(eraseWallAreaCommandDto, walls.eraseArea.bind(walls)));
    socket.on('light:createMany', create(createLightsCommandDto, lights.createMany.bind(lights)));
    socket.on('light:moveMany', mutate(moveLightsCommandDto, lights.moveMany.bind(lights)));
    socket.on(
      'light:setRangeMany',
      mutate(setLightRangesCommandDto, lights.setRangeMany.bind(lights)),
    );
    socket.on(
      'light:setColorMany',
      mutate(setLightColorsCommandDto, lights.setColorMany.bind(lights)),
    );
    socket.on(
      'light:setConeMany',
      mutate(setLightConesCommandDto, lights.setConeMany.bind(lights)),
    );
    socket.on('light:setLitMany', mutate(setLightsLitCommandDto, lights.setLitMany.bind(lights)));
    socket.on('light:deleteMany', mutate(deleteLightsCommandDto, lights.deleteMany.bind(lights)));
    socket.on(
      'condition:define',
      mutate(defineConditionCommandDto, conditions.define.bind(conditions)),
    );
    socket.on(
      'condition:apply',
      mutate(applyConditionCommandDto, conditions.apply.bind(conditions)),
    );
    socket.on(
      'condition:applyMany',
      mutate(applyConditionsCommandDto, conditions.applyMany.bind(conditions)),
    );
    socket.on(
      'condition:remove',
      mutate(removeConditionCommandDto, conditions.remove.bind(conditions)),
    );
    socket.on(
      'condition:setRounds',
      mutate(setConditionRoundsCommandDto, conditions.setRounds.bind(conditions)),
    );
    socket.on(
      'condition:setStacks',
      mutate(setConditionStacksCommandDto, conditions.setStacks.bind(conditions)),
    );
    bindConditionCatalogCommands(socket, { mutate, bind }, deps);
    socket.on('combat:start', mutate(startCombatCommandDto, combat.start.bind(combat)));
    socket.on('combat:end', mutate(endCombatCommandDto, combat.end.bind(combat)));
    socket.on(
      'combat:addCombatants',
      mutate(addCombatantsCommandDto, combat.addCombatants.bind(combat)),
    );
    socket.on(
      'combat:removeCombatant',
      mutate(removeCombatantCommandDto, combat.removeCombatant.bind(combat)),
    );
    socket.on(
      'combat:regroupTokens',
      mutate(regroupTokensCommandDto, combat.regroupTokens.bind(combat)),
    );
    socket.on(
      'combat:renameCombatant',
      mutate(renameCombatantCommandDto, combat.renameCombatant.bind(combat)),
    );
    socket.on('combat:moveInTie', mutate(moveInTieCommandDto, combat.moveInTie.bind(combat)));
    socket.on(
      'combat:setInitiative',
      mutate(setInitiativeCommandDto, combat.setInitiative.bind(combat)),
    );
    socket.on('combat:nextTurn', mutate(nextTurnCommandDto, combat.nextTurn.bind(combat)));
    socket.on(
      'combat:previousTurn',
      mutate(previousTurnCommandDto, combat.previousTurn.bind(combat)),
    );
  };
}
