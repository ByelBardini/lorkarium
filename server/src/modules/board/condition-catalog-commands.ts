import {
  conditionUsageCommandDto,
  deleteConditionDefinitionCommandDto,
  restoreDefaultConditionsCommandDto,
  updateConditionDefinitionCommandDto,
  type ConditionUsageAckDto,
} from '@lorkarium/contracts';
import type { RealtimeSocket } from '../../realtime/realtime-server';
import type { ConditionCatalogService } from '../conditions/condition-catalog.service';
import type { BindCommand } from './board-command-edge';
import type { MutateCommand } from './character-commands';

export type ConditionCatalogCommandsDeps = Readonly<{
  conditionCatalog: Pick<
    ConditionCatalogService,
    'update' | 'delete' | 'usage' | 'restoreDefaults'
  >;
}>;

type ConditionUsageOk = Extract<ConditionUsageAckDto, { ok: true }>;

/** The master's commands on the table's list of conditions, on one connection. The usage count
 *  is a read: it skips the table's queue, like `board:sync`.
 *
 *  Example: `bindConditionCatalogCommands(socket, { mutate, bind }, { conditionCatalog })` */
export function bindConditionCatalogCommands(
  socket: RealtimeSocket,
  { mutate, bind }: Readonly<{ mutate: MutateCommand; bind: BindCommand }>,
  { conditionCatalog: catalog }: ConditionCatalogCommandsDeps,
): void {
  socket.on(
    'condition:updateDefinition',
    mutate(updateConditionDefinitionCommandDto, catalog.update.bind(catalog)),
  );
  socket.on(
    'condition:deleteDefinition',
    mutate(deleteConditionDefinitionCommandDto, catalog.delete.bind(catalog)),
  );
  socket.on(
    'condition:restoreDefaults',
    mutate(restoreDefaultConditionsCommandDto, (userId, campaignId) =>
      catalog.restoreDefaults(userId, campaignId),
    ),
  );
  socket.on(
    'condition:usage',
    bind(conditionUsageCommandDto, async (userId, command): Promise<ConditionUsageOk> => {
      const tokens = await catalog.usage(userId, command.campaignId, command);
      return { ok: true, tokens };
    }),
  );
}
