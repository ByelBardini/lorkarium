import { KeyboardIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type ChatShortcutsButtonProps = Readonly<{
  /** At the Table: "/w" and, for who plays, the rolls. */
  atTable: boolean;
  canRoll: boolean;
}>;

/** "Atalhos" and its popover (Enter, Shift+Enter, @nome and the commands the conversation and the
 *  role allow), on the line above the feed so it takes no line of its own.
 *
 *  Example: `<ChatShortcutsButton atTable canRoll={!watchesOnly(role)} />` */
export function ChatShortcutsButton({ atTable, canRoll }: ChatShortcutsButtonProps) {
  return (
    <div
      data-testid="composer-hint"
      className="flex items-center text-[11px] text-muted-foreground"
    >
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Atalhos do chat"
            className="text-muted-foreground"
          >
            <KeyboardIcon aria-hidden="true" />
            Atalhos
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="end"
          aria-label="Atalhos do chat"
          className="w-80 max-w-[calc(100vw-2rem)] gap-3 p-4"
        >
          <h3 className="text-sm font-semibold text-label">Atalhos do chat</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
            <ShortcutRow shortcut="Enter" description="Enviar mensagem" />
            <ShortcutRow shortcut="Shift+Enter" description="Quebrar linha" />
            <ShortcutRow shortcut="@nome" description="Mencionar alguém" />
            {atTable && <ShortcutRow shortcut="/w nome mensagem" description="Sussurrar" />}
            {atTable && canRoll && (
              <>
                <ShortcutRow shortcut="/r 1d20+5" description="Rolar para a mesa" />
                <ShortcutRow shortcut="/gr 2d6" description="Rolar só para mestres" />
                <ShortcutRow shortcut="/rolagem-salva" description="Rolar uma salva" />
              </>
            )}
          </dl>
          {atTable && (
            <p className="text-xs text-muted-foreground">
              Digite / no campo para ver os comandos disponíveis.
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ShortcutRow({
  shortcut,
  description,
}: Readonly<{ shortcut: string; description: string }>) {
  return (
    <>
      <dt className="font-mono text-label">{shortcut}</dt>
      <dd className="text-muted-foreground">{description}</dd>
    </>
  );
}
