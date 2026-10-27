import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ConfirmedRole, RoleChangeFlow } from './use-member-role-change';

export const MOVE_TO_SPECTATORS_DETAIL =
  'Tokens, ficha e personagem ficam guardados e voltam numa nova promoção.';

type RoleQuestion = Readonly<{
  title: (name: string) => string;
  detail: (name: string) => string;
  action: string;
  boxClass: string;
  variant: 'default' | 'destructive';
}>;

const QUESTION: Readonly<Record<ConfirmedRole, RoleQuestion>> = {
  master: {
    title: (name) => `Tornar ${name} mestre?`,
    detail: (name) => `${name} passa a ver grids privados, tokens ocultos e rolagens secretas.`,
    action: 'Tornar mestre',
    boxClass: 'border-primary/50 bg-primary/10',
    variant: 'default',
  },
  spectator: {
    title: (name) => `Mover ${name} para espectadores?`,
    detail: () => MOVE_TO_SPECTATORS_DETAIL,
    action: 'Mover',
    boxClass: 'border-destructive/50 bg-destructive/10',
    variant: 'destructive',
  },
};

export type RoleChangeConfirmProps = Readonly<{
  /** The account name of the member. */
  name: string;
  role: ConfirmedRole;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}>;

/** The question in place, under the row, before a role change that is asked first: "Tornar Bia
 *  mestre?" (she starts seeing the secrets) or "Mover Bia para espectadores?" (she stops playing;
 *  tokens, card and character stay until a new promotion). Esc cancels.
 *
 *  Example: `{flow.asking && <RoleChangeConfirm name="Bia" role={flow.asking} disabled={false} onConfirm={flow.confirm} onCancel={flow.cancel} />}` */
export function RoleChangeConfirm(props: RoleChangeConfirmProps): React.JSX.Element {
  const id = useId();
  const question = QUESTION[props.role];
  return (
    <div
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-detail`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') props.onCancel();
      }}
      className={cn('flex flex-col gap-2.5 rounded-md border p-3', question.boxClass)}
    >
      <span id={`${id}-title`} className="text-[15px] font-semibold">
        {question.title(props.name)}
      </span>
      <span id={`${id}-detail`} className="text-[13px] text-label">
        {question.detail(props.name)}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant={question.variant}
          className="flex-1"
          disabled={props.disabled}
          onClick={props.onConfirm}
        >
          {question.action}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          autoFocus
          onClick={props.onCancel}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** What a role change leaves under the row: the question while it is asked, then the refusal.
 *
 *  Example: `{flow && <RoleChangeFeedback flow={flow} name={member.name} />}` */
export function RoleChangeFeedback({
  flow,
  name,
}: Readonly<{ flow: RoleChangeFlow; name: string }>): React.JSX.Element {
  return (
    <>
      {flow.asking && (
        <RoleChangeConfirm
          name={name}
          role={flow.asking}
          disabled={flow.pending}
          onConfirm={flow.confirm}
          onCancel={flow.cancel}
        />
      )}
      {flow.failure && (
        <p role="alert" className="text-xs text-destructive-text">
          {flow.failure}
        </p>
      )}
    </>
  );
}
