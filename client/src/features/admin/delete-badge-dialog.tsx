import type { AdminBadgeDto } from '@lorkarium/contracts';
import { badgeDeletionConsequence, badgeFailureMessage } from './admin-messages';
import { ConfirmDialogFrame } from './confirm-dialog-frame';
import { badgesFailureOf, useBadgesFetcher, useOnBadgesSettled } from './use-badges-fetcher';

export type DeleteBadgeDialogProps = Readonly<{
  badge: AdminBadgeDto;
  /** After the catalog no longer shows it; the dialog closes. */
  onDeleted: () => void;
  onClose: () => void;
}>;

/** "Excluir 'Veterano'?" with how many accounts lose it; it leaves the list only after "Excluir".
 *
 *  Example: `<DeleteBadgeDialog badge={veteran} onDeleted={…} onClose={…} />` */
export function DeleteBadgeDialog({
  badge,
  onDeleted,
  onClose,
}: DeleteBadgeDialogProps): React.JSX.Element {
  const fetcher = useBadgesFetcher();
  const failure = badgesFailureOf(fetcher.settled);
  useOnBadgesSettled(fetcher.settled, (result) => {
    if (!('failure' in result)) onDeleted();
  });
  return (
    <ConfirmDialogFrame
      title={`Excluir '${badge.name}'?`}
      consequence={badgeDeletionConsequence(badge.holders)}
      confirmLabel="Excluir"
      busyLabel="Excluindo…"
      danger
      busy={fetcher.busy}
      failureMessage={failure && badgeFailureMessage(failure)}
      onConfirm={() => fetcher.send({ intent: 'delete', badgeId: badge.id })}
      onClose={onClose}
    />
  );
}
