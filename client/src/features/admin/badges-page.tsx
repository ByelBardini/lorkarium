import type { AdminBadgeDto } from '@lorkarium/contracts';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import type { CropAreaComponent } from '@/components/image-crop/image-crop-dialog';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { BadgesAdminApi } from '@/services/badges-admin-api';
import { badgeFailureMessage } from './admin-messages';
import { useBadgeImagePick, useBadgeImageSend } from './badge-image';
import type { BadgeRowCommand } from './badge-row-menu';
import { BadgeSheet } from './badge-sheet';
import { BadgesTable } from './badges-table';
import { DeleteBadgeDialog } from './delete-badge-dialog';
import { badgesFailureOf, useBadgesFetcher } from './use-badges-fetcher';

export type BadgesPageProps = Readonly<{
  badges: readonly AdminBadgeDto[];
  api: BadgesAdminApi;
  /** The drag-and-zoom area of the crop dialog; a spec passes a fake. */
  cropArea?: CropAreaComponent;
}>;

/** The sheet open: `null` badge creates one. */
type OpenSheet = Readonly<{ badge: AdminBadgeDto | null }>;

/** "Insígnias": the catalog the admin grants from the users' menu, in the order every card shows.
 *  Create and edit in a sheet, change the image from the row, move up and down, delete confirmed.
 *
 *  Example: `<BadgesPage badges={badges} api={deps.badgesAdminApi} />` */
export function BadgesPage({ badges, api, cropArea }: BadgesPageProps): React.JSX.Element {
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [deleting, setDeleting] = useState<AdminBadgeDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const order = useOrderCommand(badges);
  const image = useRowImage(api, setNotice, cropArea);
  const done = (message: string): void => {
    setNotice(message);
    setSheet(null);
    setDeleting(null);
  };
  const open = (command: BadgeRowCommand, badge: AdminBadgeDto): void => {
    if (command === 'edit') setSheet({ badge });
    else if (command === 'delete') setDeleting(badge);
    else image.choose(badge);
  };
  return (
    <div className="flex w-full flex-col gap-6 px-4 py-8 sm:px-8 lg:px-12">
      <title>Lorkarium · Insígnias</title>
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex flex-1 flex-col gap-1.5">
          <h1 className="font-display text-[42px] leading-[1.05] font-medium">Insígnias</h1>
          <p className="text-sm text-muted-foreground">
            O que você concede às contas pelo menu de Usuários. O card mostra nesta ordem.
          </p>
        </div>
        <Button size="xl" onClick={() => setSheet({ badge: null })}>
          <PlusIcon aria-hidden="true" />
          Nova insígnia
        </Button>
      </header>
      <p role="status" className="min-h-5 text-sm text-foreground">
        {notice}
      </p>
      {(order.problem ?? image.problem) && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {order.problem ?? image.problem}
        </Alert>
      )}
      {badges.length === 0 ? (
        <p className="border-t border-divider py-10 text-muted-foreground">
          Nenhuma insígnia ainda.
        </p>
      ) : (
        <BadgesTable badges={badges} ordering={order.busy} onMove={order.move} onCommand={open} />
      )}
      {image.element}
      {sheet && (
        <BadgeSheet
          badge={sheet.badge}
          api={api}
          cropArea={cropArea}
          onDone={done}
          onClose={() => setSheet(null)}
        />
      )}
      {deleting && (
        <DeleteBadgeDialog
          badge={deleting}
          onDeleted={() => done(`“${deleting.name}” excluída.`)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

type OrderCommand = Readonly<{
  busy: boolean;
  problem: string | null;
  move: (badge: AdminBadgeDto, step: -1 | 1) => void;
}>;

// The whole list goes; a stale one (someone created or deleted meanwhile) comes back reloaded.
function useOrderCommand(badges: readonly AdminBadgeDto[]): OrderCommand {
  const fetcher = useBadgesFetcher();
  const failure = badgesFailureOf(fetcher.settled);
  const move = (badge: AdminBadgeDto, step: -1 | 1): void => {
    const ids = badges.map(({ id }) => id);
    const from = ids.indexOf(badge.id);
    const neighbour = ids[from + step];
    if (from < 0 || neighbour === undefined) return;
    ids[from + step] = badge.id;
    ids[from] = neighbour;
    fetcher.send({ intent: 'order', badgeIds: ids });
  };
  return { busy: fetcher.busy, problem: failure && badgeFailureMessage(failure), move };
}

type RowImage = Readonly<{
  element: React.ReactNode;
  problem: string | null;
  choose: (badge: AdminBadgeDto) => void;
}>;

// "Trocar imagem" / "Enviar imagem" of a row: choose, frame, send only the image.
function useRowImage(
  api: BadgesAdminApi,
  setNotice: (notice: string | null) => void,
  cropArea: CropAreaComponent | undefined,
): RowImage {
  const [target, setTarget] = useState<AdminBadgeDto | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const sender = useBadgeImageSend(api);
  const pick = useBadgeImagePick((file, crop) => {
    if (!target) return;
    setRefused(null);
    void sender.send(target.id, file, crop).then((problem) => {
      setRefused(problem);
      setNotice(problem ? null : `Imagem de “${target.name}” enviada.`);
    });
  }, cropArea);
  const choose = (badge: AdminBadgeDto): void => {
    setTarget(badge);
    pick.open();
  };
  return { element: pick.element, problem: pick.problem ?? refused, choose };
}
