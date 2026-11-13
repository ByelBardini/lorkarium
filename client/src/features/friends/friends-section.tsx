import { useId } from 'react';

export type FriendsSectionProps = Readonly<{
  title: string;
  count: number;
  /** Shown instead of the list when it has no one. */
  empty: string;
  children: React.ReactNode;
}>;

/** A titled list of the friends screen ("Online · 2", "Recebidos · 1"), or its empty sentence.
 *
 *  Example: `<FriendsSection title="Recebidos" count={1} empty="Nenhum pedido novo.">{rows}</FriendsSection>` */
export function FriendsSection({
  title,
  count,
  empty,
  children,
}: FriendsSectionProps): React.JSX.Element {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1">
      <h2 id={id} className="px-4 text-xs font-semibold tracking-[0.12em] text-label uppercase">
        {`${title} · ${count}`}
      </h2>
      {count === 0 ? (
        <p className="px-4 py-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col">{children}</ul>
      )}
    </section>
  );
}
