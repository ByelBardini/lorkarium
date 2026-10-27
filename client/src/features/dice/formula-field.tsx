import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setLoose, trayProblemOf, type DiceTray } from '@/lib/dice-tray';
import { notationMessageOf } from './dice-messages';

export type FormulaFieldProps = Readonly<{
  tray: DiceTray;
  onTray: (tray: DiceTray) => void;
  /** Enter in the field: rolls, when the tray can. */
  onEnter: () => void;
}>;

type NotationFlag = Readonly<{ flag: string; meaning: string; example: string }>;

// N stands for any number, so the flag reads apart from the digits of the example.
const NOTATION_FLAGS: ReadonlyArray<NotationFlag> = [
  { flag: '+ -', meaning: 'soma e subtrai dados e números', example: '2d6+1d4-1' },
  { flag: 'khN', meaning: 'fica com os N maiores (vantagem)', example: '2d20kh1' },
  { flag: 'klN', meaning: 'fica com os N menores (desvantagem)', example: '4d6kl2' },
  { flag: 'dlN', meaning: 'descarta os N menores', example: '5d6dl2' },
  { flag: 'dhN', meaning: 'descarta os N maiores', example: '4d6dh1' },
  { flag: '!', meaning: 'explode: tirou o máximo, rola de novo', example: '1d6!' },
  { flag: '>N', meaning: 'conta quantos deram mais que N', example: '8d10>6' },
  { flag: '<N', meaning: 'conta quantos deram menos que N', example: '4d6<3' },
  { flag: 'rN', meaning: 'tirou N, rola de novo', example: '1d20r1' },
];

/** "Fórmula": the tray's text as typed (the dice buttons edit the same value), its notation
 *  error live and "Como escrever?", which opens the table of examples.
 *
 *  Example: `<FormulaField tray={tray} onTray={setTray} onEnter={roll} />` */
export function FormulaField({ tray, onTray, onEnter }: FormulaFieldProps): React.JSX.Element {
  const id = useId();
  const [helpOpen, setHelpOpen] = useState(false);
  const problem = trayProblemOf(tray);
  const message = problem === null ? null : notationMessageOf(problem.message);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase"
        >
          Fórmula
        </label>
        <Button
          variant="ghost"
          size="xs"
          aria-expanded={helpOpen}
          aria-controls={`${id}-help`}
          onClick={() => setHelpOpen(!helpOpen)}
          className="text-primary hover:text-primary-hover"
        >
          {helpOpen ? 'Fechar ajuda' : 'Como escrever?'}
        </Button>
      </div>
      <Input
        id={id}
        value={tray.loose}
        placeholder="Ex.: 2d6+3"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={message !== null}
        aria-describedby={message === null ? undefined : `${id}-error`}
        onChange={(event) => onTray(setLoose(tray, event.target.value))}
        onKeyDown={(event) => event.key === 'Enter' && onEnter()}
        className="h-10 font-mono text-sm"
      />
      {message !== null && (
        <p id={`${id}-error`} className="text-xs text-destructive-text">
          {message}
        </p>
      )}
      <div id={`${id}-help`} hidden={!helpOpen}>
        {helpOpen && <NotationHelp />}
      </div>
    </div>
  );
}

function NotationHelp(): React.JSX.Element {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 rounded-md border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
      {NOTATION_FLAGS.map(({ flag, meaning, example }) => (
        <div key={flag} className="contents">
          <dt>
            <code className="font-mono text-primary">{flag}</code>
          </dt>
          <dd>
            {meaning}
            <span className="block text-placeholder">
              ex.: <code className="font-mono">{example}</code>
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
