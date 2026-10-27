import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Clipboard } from '@/services/clipboard';

type CopyState = 'idle' | 'copied' | 'failed';

const ANNOUNCEMENT: Readonly<Record<CopyState, string>> = {
  idle: '',
  copied: 'Copiado',
  failed: 'Não deu para copiar. Selecione o código e copie à mão.',
};

export type CopyCodeButtonProps = Readonly<{
  code: string;
  clipboard: Clipboard;
  /** The button's text; "Copiar código" by default ("Copiar chave", "Copiar códigos"). */
  label?: string;
  /** What the live region says after a copy; "Copiado" by default ("Link copiado."). */
  copiedMessage?: string;
  /** Only the icon, with the label as its name and tooltip; the outcome is read, not shown
   *  (the desktop title bar). */
  iconOnly?: boolean;
}>;

/** "Copiar código" (or the label given), announcing the outcome in a polite live region.
 *
 *  Example: `<CopyCodeButton code="VHRN-7K2Q" clipboard={clipboard} />` */
export function CopyCodeButton({
  code,
  clipboard,
  label = 'Copiar código',
  copiedMessage = ANNOUNCEMENT.copied,
  iconOnly = false,
}: CopyCodeButtonProps): React.JSX.Element {
  const [state, setState] = useState<CopyState>('idle');
  const copy = async (): Promise<void> => {
    setState((await clipboard.copy(code)) ? 'copied' : 'failed');
  };
  const Icon = state === 'copied' ? CheckIcon : CopyIcon;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        size={iconOnly ? 'icon-sm' : 'lg'}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        onClick={() => void copy()}
      >
        <Icon aria-hidden="true" />
        {!iconOnly && label}
      </Button>
      <span role="status" className={iconOnly ? 'sr-only' : 'text-sm text-muted-foreground'}>
        {state === 'copied' ? copiedMessage : ANNOUNCEMENT[state]}
      </span>
    </div>
  );
}
