import { cn } from '@/lib/utils';

export type DefeatedLabelProps = Readonly<{
  text: string;
  defeated: boolean;
  /** Said by the screen reader after the text, where the eye sees the strike. */
  suffix: string;
  className?: string;
}>;

/** A name in the tracker, struck and dimmed once it fell.
 *
 *  Example: `<DefeatedLabel text="Goblin" defeated suffix={DEFEATED_TOKEN_SUFFIX} />` */
export function DefeatedLabel(props: DefeatedLabelProps): React.JSX.Element {
  const { text, defeated, suffix, className } = props;
  return (
    <span className={cn(className, defeated && 'text-muted-foreground line-through')}>
      {text}
      {defeated && <span className="sr-only">{suffix}</span>}
    </span>
  );
}
