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
}>;

/** "Copiar código" (or the label given), announcing the outcome in a polite live region.
 *
 *  Example: `<CopyCodeButton code="VHRN-7K2Q" clipboard={clipboard} />` */
export function CopyCodeButton({
  code,
  clipboard,
  label = 'Copiar código',
}: CopyCodeButtonProps): React.JSX.Element {
  const [state, setState] = useState<CopyState>('idle');
  const copy = async (): Promise<void> => {
    setState((await clipboard.copy(code)) ? 'copied' : 'failed');
  };
  const Icon = state === 'copied' ? CheckIcon : CopyIcon;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" size="lg" onClick={() => void copy()}>
        <Icon aria-hidden="true" />
        {label}
      </Button>
      <span role="status" className="text-sm text-muted-foreground">
        {ANNOUNCEMENT[state]}
      </span>
    </div>
  );
}
