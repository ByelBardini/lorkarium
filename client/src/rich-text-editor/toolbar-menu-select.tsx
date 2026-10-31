import type { CSSProperties, ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type ToolbarMenuOption = Readonly<{
  value: string;
  label: string;
  style?: CSSProperties;
  /** A line under this option (e.g. after "Fonte padrão"). */
  separated?: boolean;
}>;

// A menu, not a native <select>: Chromium draws a native list on white, outside the dark theme.
/** One choice of the document toolbar, shown on the trigger and picked from a themed menu; the
 *  editor selection comes back through `onChoose` (the menu never takes the focus back).
 *
 *  Example: `<ToolbarMenuSelect label="Entrelinha" value="1.15" options={[{ value: '1.15', label: '1,15' }]} onChoose={apply} />` */
export function ToolbarMenuSelect(props: {
  label: string;
  value: string;
  options: readonly ToolbarMenuOption[];
  onChoose: (value: string) => void;
  className?: string;
}): React.JSX.Element {
  const shown = props.options.find((option) => option.value === props.value);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label={props.label}
          title={props.label}
          className={cn(
            'h-7 justify-between gap-1 rounded-sm px-1.5 text-xs font-normal text-label',
            props.className,
          )}
        >
          <span className="truncate">{shown?.label ?? props.value}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-80 w-max min-w-(--radix-dropdown-menu-trigger-width) [&_[role=menuitemradio]]:whitespace-nowrap"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuRadioGroup value={props.value} onValueChange={props.onChoose}>
          {props.options.map((option) => (
            <OptionItem key={option.value} option={option} />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OptionItem({ option }: { option: ToolbarMenuOption }): ReactNode {
  return (
    <>
      <DropdownMenuRadioItem value={option.value} style={option.style}>
        {option.label}
      </DropdownMenuRadioItem>
      {option.separated && <DropdownMenuSeparator />}
    </>
  );
}
