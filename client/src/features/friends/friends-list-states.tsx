import { Button } from '@/components/ui/button';

const SKELETON_ROWS = 5;

/** The list before the first read answers: rows of the shape of a friend, nothing to read. */
export function FriendsListSkeleton(): React.JSX.Element {
  return (
    <ul aria-busy="true" aria-label="Carregando amigos" className="flex flex-col gap-1 py-4">
      {Array.from({ length: SKELETON_ROWS }, (_, row) => (
        <li key={row} className="flex items-center gap-3 px-4 py-2">
          <span className="size-9 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
          <span className="h-3 w-32 animate-pulse bg-muted motion-reduce:animate-none" />
        </li>
      ))}
    </ul>
  );
}

/** The first read failed: the sentence and "Tentar de novo".
 *
 *  Example: `<FriendsListFailure onRetry={() => void friends.getState().load()} />` */
export function FriendsListFailure({
  onRetry,
}: Readonly<{ onRetry: () => void }>): React.JSX.Element {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 px-4 py-6">
      <p className="text-sm text-destructive-text">Não deu para carregar seus amigos.</p>
      <Button variant="outline" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  );
}
