import { Loader2Icon, SendIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { countText } from './broadcast-view';
import { TwoFactorRequiredNote } from './two-factor-required-note';

export type BroadcastSendPanelProps = Readonly<{
  audience: number | null;
  tested: boolean;
  twoFactorOn: boolean;
  busy: boolean;
  onConfirm: (total: number) => void;
}>;

/** The last lock of a notice: "Enviar para N" only after a test of this very text, then the
 *  number typed by hand. Without 2FA the reason takes the button's place.
 *
 *  Example: `<BroadcastSendPanel audience={1300} tested twoFactorOn busy={false} onConfirm={send} />` */
export function BroadcastSendPanel(props: BroadcastSendPanelProps): React.JSX.Element {
  const [asking, setAsking] = useState(false);
  if (!props.twoFactorOn) return <TwoFactorRequiredNote action="enviar um comunicado" />;
  const ready = props.tested && props.audience !== null && props.audience > 0;
  if (asking && ready && props.audience !== null)
    return <TypedTotal audience={props.audience} busy={props.busy} onConfirm={props.onConfirm} />;
  return (
    <div className="flex flex-col gap-2">
      <Button size="lg" className="self-start" disabled={!ready} onClick={() => setAsking(true)}>
        <SendIcon aria-hidden="true" />
        Enviar para {countText(props.audience ?? 0)}
      </Button>
      {!props.tested && (
        <p className="text-[13px] text-muted-foreground">
          Envie um teste para você com o texto final antes de enviar para todos.
        </p>
      )}
    </div>
  );
}

type TypedTotalProps = Readonly<{
  audience: number;
  busy: boolean;
  onConfirm: (total: number) => void;
}>;

function TypedTotal({ audience, busy, onConfirm }: TypedTotalProps): React.JSX.Element {
  const id = useId();
  const [typed, setTyped] = useState('');
  const total = Number(typed.replace(/\D/g, ''));
  return (
    <div className="flex max-w-sm flex-col gap-3">
      <FormField
        id={id}
        label={`Digite ${countText(audience)} para confirmar`}
        error={undefined}
        hint="Um comunicado enviado não volta atrás."
      >
        <Input
          id={id}
          inputMode="numeric"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </FormField>
      <Button
        size="lg"
        variant="destructive"
        className="self-start"
        disabled={busy || total !== audience}
        onClick={() => onConfirm(total)}
      >
        {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {busy ? 'Confirmando…' : 'Confirmar envio'}
      </Button>
    </div>
  );
}
