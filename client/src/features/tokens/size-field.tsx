import { TOKEN_SIZE_MAX, TOKEN_SIZE_MIN } from '@lorkarium/contracts';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { cellsText } from '@/lib/cells-text';
import { cn } from '@/lib/utils';
import { stepSide } from './token-form-state';
import { SIZE_PRESETS } from './token-messages';

export type TokenSize = Readonly<{ width: number; height: number }>;

export type SizeFieldProps = Readonly<{ size: TokenSize; onChange: (size: TokenSize) => void }>;

/** "Tamanho" of a token being edited: five square presets (Miúdo ½ to Imenso 4 × 4) and
 *  "Personalizado", width × height by −/+ of half a cell, from 0,5 to 10.
 *
 *  Example: `<SizeField size={{ width: form.width, height: form.height }} onChange={resize} />` */
export function SizeField({ size, onChange }: SizeFieldProps): React.JSX.Element {
  const id = useId();
  return (
    <div role="group" aria-labelledby={`${id}-legend`} className="flex flex-col gap-2.5">
      <span id={`${id}-legend`} className="text-[13px] text-label">
        Tamanho
      </span>
      <div className="grid grid-cols-5 gap-2">
        {SIZE_PRESETS.map((preset) => {
          const pressed = size.width === preset.cells && size.height === preset.cells;
          return (
            <button
              key={preset.label}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange({ width: preset.cells, height: preset.cells })}
              className={cn(
                'flex h-13 flex-col-reverse items-center justify-center gap-0.5 rounded-md border text-muted-foreground outline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none',
                pressed ? 'border-primary bg-muted text-foreground' : 'border-input',
              )}
            >
              <span className="text-[11px]">{preset.label}</span>{' '}
              <span className="text-[15px] font-semibold">{preset.shown}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="text-[13px] text-muted-foreground">Personalizado</span>
        <span className="inline-flex items-center gap-2">
          <SideStepper
            side="largura"
            cells={size.width}
            onChange={(width) => onChange({ ...size, width })}
          />
          <span aria-hidden="true" className="text-placeholder">
            ×
          </span>
          <SideStepper
            side="altura"
            cells={size.height}
            onChange={(height) => onChange({ ...size, height })}
          />
        </span>
      </div>
    </div>
  );
}

type SideStepperProps = Readonly<{
  side: 'largura' | 'altura';
  cells: number;
  onChange: (cells: number) => void;
}>;

function SideStepper({ side, cells, onChange }: SideStepperProps): React.JSX.Element {
  const label = side === 'largura' ? 'Largura' : 'Altura';
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-input p-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Diminuir ${side}`}
        disabled={cells <= TOKEN_SIZE_MIN}
        onClick={() => onChange(stepSide(cells, -1))}
      >
        <MinusIcon aria-hidden="true" />
      </Button>
      <output
        aria-label={label}
        className="min-w-10 text-center text-sm font-semibold tabular-nums"
      >
        {cellsText(cells)}
      </output>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Aumentar ${side}`}
        disabled={cells >= TOKEN_SIZE_MAX}
        onClick={() => onChange(stepSide(cells, 1))}
      >
        <PlusIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
