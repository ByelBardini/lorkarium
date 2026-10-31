import { CheckIcon, CopyIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Clipboard } from '@/services/clipboard';
import { sheetApiReferenceMarkdown } from './sheet-api-reference-markdown';

/** How long "Copiado" (or the failure) stays before the button goes back to its label. */
export const COPY_FEEDBACK_MS = 2500;

type CopyOutcome = 'idle' | 'copied' | 'failed';

const OUTCOME_TEXT: Readonly<Record<CopyOutcome, string>> = {
  idle: '',
  copied: 'Copiado',
  failed: 'Não foi possível copiar',
};

/** "Copiar documentação": the whole reference in Markdown on the clipboard, to hand to an AI;
 *  says "Copiado" (or that the browser refused) for a moment.
 *
 *  Example: `<CopyReferenceButton clipboard={deps.clipboard} />` */
export function CopyReferenceButton({
  clipboard,
}: Readonly<{ clipboard: Clipboard }>): React.JSX.Element {
  const [outcome, setOutcome] = useState<CopyOutcome>('idle');
  useEffect(() => {
    if (outcome === 'idle') return;
    const timer = setTimeout(() => setOutcome('idle'), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [outcome]);
  const copy = async (): Promise<void> => {
    const copied = await clipboard.copy(sheetApiReferenceMarkdown());
    setOutcome(copied ? 'copied' : 'failed');
  };
  const Icon = outcome === 'copied' ? CheckIcon : CopyIcon;
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => void copy()}>
        <Icon aria-hidden="true" />
        Copiar documentação
      </Button>
      <p
        role="status"
        className={
          outcome === 'failed' ? 'text-xs text-destructive-text' : 'text-xs text-muted-foreground'
        }
      >
        {OUTCOME_TEXT[outcome]}
      </p>
    </div>
  );
}
