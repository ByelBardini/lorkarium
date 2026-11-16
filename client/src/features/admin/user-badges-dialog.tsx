import type { AdminBadgeDto, AdminUserDto } from '@lorkarium/contracts';
import { Loader2Icon, RotateCwIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useRevalidator } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { badgeImageUrlOf } from '@/lib/badge-image-url';
import type { BadgesAdminApi, BadgesAdminFailure } from '@/services/badges-admin-api';
import { badgeFailureMessage } from './admin-messages';

const CATALOG_CHANGED =
  'O catálogo mudou enquanto você marcava. As insígnias foram recarregadas; confira e salve de novo.';

type GrantsLoad =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'failed' }>
  | Readonly<{ kind: 'ready'; catalog: AdminBadgeDto[]; held: readonly string[] }>;

export type UserBadgesDialogProps = Readonly<{
  user: AdminUserDto;
  api: BadgesAdminApi;
  /** Saved: the page writes `message` in its notice and closes the dialog. */
  onDone: (message: string) => void;
  onClose: () => void;
}>;

/** "Insígnias de @bia": one box per catalog badge (image + name), the held ones marked; "Salvar"
 *  sends the whole set. A badge without image cannot be granted; a catalog changed meanwhile
 *  reloads the boxes.
 *
 *  Example: `<UserBadgesDialog user={bia} api={deps.badgesAdminApi} onDone={setNotice} onClose={close} />` */
export function UserBadgesDialog(props: UserBadgesDialogProps): React.JSX.Element {
  const handle = `@${props.user.username}`;
  const [round, setRound] = useState(0);
  const [stale, setStale] = useState(false);
  const load = useGrantsLoad(props.api, props.user.id, round);
  const reloadStale = (): void => {
    setStale(true);
    setRound((n) => n + 1);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Insígnias de {handle}</DialogTitle>
          <DialogDescription>
            Marque as que a conta tem. O card mostra na ordem do catálogo.
          </DialogDescription>
        </DialogHeader>
        {stale && (
          <Alert variant="destructive" className="px-3.5 py-3 text-sm">
            {CATALOG_CHANGED}
          </Alert>
        )}
        {load.kind === 'loading' && <p role="status">Carregando as insígnias…</p>}
        {load.kind === 'failed' && <LoadFailed onRetry={() => setRound((n) => n + 1)} />}
        {load.kind === 'ready' && (
          <GrantsForm
            key={round}
            {...props}
            catalog={load.catalog}
            held={load.held}
            onSaved={() => props.onDone(`Insígnias de ${handle} salvas.`)}
            onStale={reloadStale}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Each round reads the catalog and the account's ids again ("Tentar de novo", a stale save).
function useGrantsLoad(api: BadgesAdminApi, userId: string, round: number): GrantsLoad {
  const [load, setLoad] = useState<Readonly<{ round: number; value: GrantsLoad }>>({
    round: -1,
    value: { kind: 'loading' },
  });
  useEffect(() => {
    let live = true;
    void Promise.all([api.catalog(), api.grantsOf(userId)]).then(([catalog, held]) => {
      if (!live) return;
      const value: GrantsLoad =
        catalog.ok && held.ok
          ? { kind: 'ready', catalog: catalog.value, held: held.value }
          : { kind: 'failed' };
      setLoad({ round, value });
    });
    return () => {
      live = false;
    };
  }, [api, userId, round]);
  return load.round === round ? load.value : { kind: 'loading' };
}

function LoadFailed({ onRetry }: Readonly<{ onRetry: () => void }>): React.JSX.Element {
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className="text-sm text-muted-foreground">
        Não deu para carregar as insígnias.
      </p>
      <Button variant="outline" size="lg" onClick={onRetry}>
        <RotateCwIcon aria-hidden="true" />
        Tentar de novo
      </Button>
    </div>
  );
}

type GrantsFormProps = UserBadgesDialogProps &
  Readonly<{
    catalog: AdminBadgeDto[];
    held: readonly string[];
    onSaved: () => void;
    onStale: () => void;
  }>;

function GrantsForm(props: GrantsFormProps): React.JSX.Element {
  const [marked, setMarked] = useState<ReadonlySet<string>>(() => new Set(props.held));
  const save = useGrantSave(props);
  if (props.catalog.length === 0) return <EmptyCatalog />;
  const changed = !sameSet(marked, props.held);
  const toggle = (badgeId: string, on: boolean): void => {
    const next = new Set(marked);
    if (on) next.add(badgeId);
    else next.delete(badgeId);
    setMarked(next);
  };
  return (
    <>
      <ul aria-label="Catálogo de insígnias" className="flex flex-col gap-2">
        {props.catalog.map((badge) => (
          <BadgeChoice
            key={badge.id}
            badge={badge}
            checked={marked.has(badge.id)}
            onToggle={toggle}
          />
        ))}
      </ul>
      {save.problem && (
        <Alert variant="destructive" className="px-3.5 py-3 text-sm">
          {save.problem}
        </Alert>
      )}
      <DialogFooter>
        <Button variant="outline" size="lg" disabled={save.busy} onClick={props.onClose}>
          Cancelar
        </Button>
        <Button size="lg" disabled={!changed || save.busy} onClick={() => save.send(marked)}>
          {save.busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          {save.busy ? 'Salvando…' : 'Salvar'}
        </Button>
      </DialogFooter>
    </>
  );
}

type GrantSave = Readonly<{
  busy: boolean;
  problem: string | null;
  send: (marked: ReadonlySet<string>) => void;
}>;

// A fallen session or a lost role: the users loader refuses on the reload and leaves the page.
function useGrantSave(props: GrantsFormProps): GrantSave {
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const settle = (failure: BadgesAdminFailure): void => {
    if (failure.kind === 'unauthenticated' || failure.kind === 'forbidden') {
      void revalidator.revalidate();
      return;
    }
    if (failure.kind === 'badge_without_image' || failure.kind === 'not_found') {
      props.onStale();
      return;
    }
    setProblem(badgeFailureMessage(failure));
  };
  const send = (marked: ReadonlySet<string>): void => {
    setBusy(true);
    setProblem(null);
    void props.api.grant(props.user.id, [...marked]).then((result) => {
      setBusy(false);
      if (result.ok) props.onSaved();
      else settle(result.failure);
    });
  };
  return { busy, problem, send };
}

type BadgeChoiceProps = Readonly<{
  badge: AdminBadgeDto;
  checked: boolean;
  onToggle: (badgeId: string, on: boolean) => void;
}>;

function BadgeChoice({ badge, checked, onToggle }: BadgeChoiceProps): React.JSX.Element {
  const id = `user-badge-${badge.id}`;
  const withoutImage = badge.imageId === null;
  return (
    <li className="flex items-center gap-3">
      <Checkbox
        id={id}
        checked={checked}
        disabled={withoutImage && !checked}
        onCheckedChange={(state) => onToggle(badge.id, state === true)}
      />
      {badge.imageId !== null && (
        <img src={badgeImageUrlOf(badge.imageId)} alt="" className="size-8 object-contain" />
      )}
      <label htmlFor={id} className="text-sm text-foreground">
        {badge.name}
      </label>
      {withoutImage && <span className="text-xs text-muted-foreground">Sem imagem</span>}
    </li>
  );
}

function EmptyCatalog(): React.JSX.Element {
  return (
    <p className="text-sm text-muted-foreground">
      Crie uma insígnia em{' '}
      <Link to="/admin/badges" className="text-primary">
        Insígnias
      </Link>{' '}
      primeiro.
    </p>
  );
}

function sameSet(marked: ReadonlySet<string>, held: readonly string[]): boolean {
  return marked.size === held.length && held.every((id) => marked.has(id));
}
