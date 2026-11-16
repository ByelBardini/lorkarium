import type { AdminBadgeDto } from '@lorkarium/contracts';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { badgeImageUrlOf } from '@/lib/badge-image-url';
import { badgeHoldersLabel } from './admin-messages';
import { BadgeRowMenu, type BadgeRowCommand } from './badge-row-menu';

const HEAD =
  'px-3.5 py-2.5 text-left text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap text-placeholder uppercase';
const CELL = 'px-3.5 py-3 align-middle text-sm text-label';

export type BadgesTableProps = Readonly<{
  badges: readonly AdminBadgeDto[];
  /** While a new order goes, the arrows wait. */
  ordering: boolean;
  onMove: (badge: AdminBadgeDto, step: -1 | 1) => void;
  onCommand: (command: BadgeRowCommand, badge: AdminBadgeDto) => void;
}>;

/** The catalog in its order: image (or "Sem imagem" + "Enviar imagem"), name, description, how
 *  many accounts hold it, the arrows (none up on the first, none down on the last) and the menu.
 *
 *  Example: `<BadgesTable badges={badges} ordering={false} onMove={move} onCommand={open} />` */
export function BadgesTable(props: BadgesTableProps): React.JSX.Element {
  const last = props.badges.length - 1;
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">Insígnias</caption>
        <thead>
          <tr>
            {['Imagem', 'Nome', 'Descrição', 'Contas'].map((title) => (
              <th key={title} scope="col" className={HEAD}>
                {title}
              </th>
            ))}
            <th scope="col" className={HEAD}>
              <span className="sr-only">Ordem e ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.badges.map((badge, index) => (
            <tr key={badge.id} className="border-t border-divider">
              <td className={CELL}>
                <BadgeImageCell badge={badge} onSend={() => props.onCommand('image', badge)} />
              </td>
              <td className={`${CELL} font-semibold whitespace-nowrap text-foreground`}>
                {badge.name}
              </td>
              <td className={CELL}>{badge.description}</td>
              <td className={`${CELL} whitespace-nowrap`}>{badgeHoldersLabel(badge.holders)}</td>
              <td className={`${CELL} text-right whitespace-nowrap`}>
                <MoveButtons
                  badge={badge}
                  first={index === 0}
                  last={index === last}
                  disabled={props.ordering}
                  onMove={(step) => props.onMove(badge, step)}
                />
                <BadgeRowMenu
                  badge={badge}
                  onCommand={(command) => props.onCommand(command, badge)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BadgeImageCell({
  badge,
  onSend,
}: Readonly<{ badge: AdminBadgeDto; onSend: () => void }>): React.JSX.Element {
  if (badge.imageId !== null) {
    return (
      <img
        src={badgeImageUrlOf(badge.imageId)}
        alt={badge.name}
        className="size-10 border border-border object-contain"
      />
    );
  }
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className="text-xs text-muted-foreground">Sem imagem</span>
      <Button variant="outline" size="sm" onClick={onSend}>
        Enviar imagem
      </Button>
    </div>
  );
}

type MoveButtonsProps = Readonly<{
  badge: AdminBadgeDto;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onMove: (step: -1 | 1) => void;
}>;

function MoveButtons({ badge, first, last, disabled, onMove }: MoveButtonsProps) {
  return (
    <span className="inline-flex gap-1">
      {!first && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Subir ${badge.name}`}
          disabled={disabled}
          onClick={() => onMove(-1)}
        >
          <ArrowUpIcon aria-hidden="true" />
        </Button>
      )}
      {!last && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Descer ${badge.name}`}
          disabled={disabled}
          onClick={() => onMove(1)}
        >
          <ArrowDownIcon aria-hidden="true" />
        </Button>
      )}
    </span>
  );
}
