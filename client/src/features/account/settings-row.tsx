import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type SettingsRowProps = Readonly<{
  title: string;
  /** The line under the title; `descriptionId` lets the control point at it. */
  description?: React.ReactNode;
  descriptionId?: string;
  /** The title becomes the `<label>` of this control. */
  titleFor?: string;
  /** The title's id, for a control named by `aria-labelledby` (a radio group). */
  titleId?: string;
  /** The row is a `group` named by the title (a photo with its buttons). */
  group?: boolean;
  busy?: boolean;
  children: React.ReactNode;
}>;

/** One setting of "Minha conta": title and explanation on the left, the control on the right,
 *  rows apart by a thin line. From `md` down, one column.
 *
 *  Example: `<SettingsRow title="Apelido" titleFor={id} description="Aparece nas mesas."><Input id={id} /></SettingsRow>` */
export function SettingsRow(props: SettingsRowProps): React.JSX.Element {
  const ownId = useId();
  const titleId = props.titleId ?? ownId;
  return (
    <div
      role={props.group ? 'group' : undefined}
      aria-labelledby={props.group ? titleId : undefined}
      aria-busy={props.busy}
      className="grid gap-x-12 gap-y-4 border-t border-divider py-8 first:border-t-0 first:pt-2 md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]"
    >
      <div className="flex flex-col gap-1.5">
        <SettingsRowTitle id={titleId} htmlFor={props.titleFor}>
          {props.title}
        </SettingsRowTitle>
        {props.description && (
          <p id={props.descriptionId} className="text-sm/relaxed text-muted-foreground">
            {props.description}
          </p>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-3">{props.children}</div>
    </div>
  );
}

const TITLE_CLASS = 'text-base font-semibold text-foreground';

function SettingsRowTitle({
  id,
  htmlFor,
  children,
}: Readonly<{ id: string; htmlFor: string | undefined; children: string }>): React.JSX.Element {
  if (htmlFor === undefined) {
    return (
      <span id={id} className={TITLE_CLASS}>
        {children}
      </span>
    );
  }
  return (
    <Label id={id} htmlFor={htmlFor} className={cn(TITLE_CLASS, 'w-fit')}>
      {children}
    </Label>
  );
}
