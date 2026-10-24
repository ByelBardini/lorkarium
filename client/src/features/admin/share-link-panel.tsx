import { CopyCodeButton } from '@/components/copy-code-button';
import { Input } from '@/components/ui/input';
import type { Clipboard } from '@/services/clipboard';

export type ShareLinkPanelProps = Readonly<{
  link: string;
  /** The accessible name of the read-only field ("Link do convite"). */
  fieldLabel: string;
  note: string;
  clipboard: Clipboard;
}>;

/** A one-time link to send by other means: the read-only field, "Copiar link" and what it is
 *  worth (how long, once).
 *
 *  Example: `<ShareLinkPanel link={link} fieldLabel="Link do convite" note="O link vale 7 dias…" clipboard={clipboard} />` */
export function ShareLinkPanel({
  link,
  fieldLabel,
  note,
  clipboard,
}: ShareLinkPanelProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <Input
        readOnly
        aria-label={fieldLabel}
        value={link}
        onFocus={(event) => event.currentTarget.select()}
      />
      <CopyCodeButton
        code={link}
        clipboard={clipboard}
        label="Copiar link"
        copiedMessage="Link copiado."
      />
      <p className="text-sm text-muted-foreground">{note}</p>
    </div>
  );
}
