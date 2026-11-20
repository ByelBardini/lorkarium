/** `pnpm db:remove-orphan-objects` without saying what to do: it queues the removal of stored
 *  files, so it only writes with `--yes` (and only lists with `--dry-run`). */
export class RemoveOrphanObjectsRefusedError extends Error {
  readonly code = 'REMOVE_ORPHAN_OBJECTS_REFUSED';

  constructor(readonly nodeEnv: string) {
    super(
      `the orphan objects removal deletes stored files; received NODE_ENV=${nodeEnv} with neither --dry-run nor --yes, expected --dry-run (list only) or --yes (queue the removals)`,
    );
    this.name = 'RemoveOrphanObjectsRefusedError';
  }
}
