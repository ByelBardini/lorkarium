/** The heading of an account section: display title and one line under it.
 *
 *  Example: `<SectionHeading id={titleId} title="Perfil">Isso aparece em todas as mesas.</SectionHeading>` */
export function SectionHeading({
  id,
  title,
  children,
}: Readonly<{ id: string; title: string; children: React.ReactNode }>): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="font-display text-2xl font-semibold">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
