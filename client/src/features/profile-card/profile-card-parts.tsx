import type { ProfileCardDto } from '@lorkarium/contracts';
import { PresenceDot } from '@/components/presence-dot';
import { UserAvatar } from '@/components/user-avatar';
import { UserHandle } from '@/components/user-handle';
import { bannerUrlOf } from '@/lib/banner-url';
import { memberColorCss } from '@/lib/member-color';
import { cn } from '@/lib/utils';
import { approvalText, cardCount, memberSinceTag } from './profile-card-text';

type CardPartProps = Readonly<{ card: ProfileCardDto; full: boolean }>;

const LABEL_CLASS = 'font-brand text-[10px] font-semibold tracking-[0.14em] uppercase';

/** The top of the card: the paid banner image, or the profile color fading into the card, with
 *  "Desde" on the right (clear of the modal's close button).
 *
 *  Example: `<ProfileCardBanner card={card} full={false} />` */
export function ProfileCardBanner({ card, full }: CardPartProps): React.JSX.Element {
  return (
    <div
      data-testid="profile-card-banner"
      style={{ backgroundColor: memberColorCss(card.color) }}
      // The fade is a mask, not a card-colored overlay: the centered modal lands on a half pixel
      // and the image leaked a thin bright line under the overlay's last row.
      className={cn(
        'relative overflow-hidden [mask-image:linear-gradient(to_bottom,#000_calc(100%-2.5rem),transparent)]',
        full ? 'h-36' : 'h-24',
      )}
    >
      {card.bannerId !== null && (
        <img
          data-testid="profile-card-banner-image"
          src={bannerUrlOf(card.bannerId)}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
      )}
      <span
        className={cn(
          LABEL_CLASS,
          'absolute top-2.5 rounded-full bg-black/45 px-2.5 py-1 text-[#efe3c8]',
          full ? 'right-12' : 'right-3',
        )}
      >
        {memberSinceTag(card)}
      </span>
    </div>
  );
}

/** The avatar over the banner's edge, the nickname and the @ with the seal.
 *
 *  Example: `<ProfileCardHeader card={card} full />` */
export function ProfileCardHeader({ card, full }: CardPartProps): React.JSX.Element {
  return (
    <div className={cn('flex items-end gap-3.5', full ? '-mt-14 px-6' : '-mt-10 px-4.5')}>
      <span className="relative shrink-0 rounded-full bg-linear-160 from-[#e8c88e] to-[#5a4528] p-[3px]">
        <UserAvatar
          name={card.name}
          color={card.color}
          avatarId={card.avatarId}
          size="xl"
          className={full ? 'size-28 text-3xl' : 'size-20 text-2xl'}
        />
        {card.presence !== null && (
          <PresenceDot status={card.presence} className="right-1 bottom-1.5 size-4 ring-card" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col pb-0.5">
        <span
          className={cn(
            'font-brand leading-tight font-bold tracking-[0.03em] break-words text-foreground',
            full ? 'text-2xl' : 'text-lg',
          )}
        >
          {card.name}
        </span>
        <UserHandle
          username={card.username}
          seal={card}
          className="text-xs text-muted-foreground"
        />
      </span>
    </div>
  );
}

const RELATION_CHIPS: Readonly<Partial<Record<ProfileCardDto['relation'], string>>> = {
  friend: '✓ Amigos',
  outgoing: 'Pedido enviado',
  incoming: 'Quer ser seu amigo',
  blocked: 'Bloqueado por você',
};

/** The relation, the tables (and, in the modal, the friends) in common and the presence.
 *
 *  Example: `<ProfileCardRelation card={card} full={false} />` */
export function ProfileCardRelation({ card, full }: CardPartProps): React.JSX.Element {
  const relation = RELATION_CHIPS[card.relation];
  const tables = card.mutualCampaigns.length;
  return (
    <div
      className={cn('flex flex-wrap items-center gap-1.5 pt-3 text-xs', full ? 'px-6' : 'px-4.5')}
    >
      {relation && <Chip>{relation}</Chip>}
      {tables > 0 && <Chip>{tables === 1 ? '1 mesa em comum' : `${tables} mesas em comum`}</Chip>}
      {full && card.mutualFriends > 0 && (
        <Chip>
          {card.mutualFriends === 1 ? '1 amigo em comum' : `${card.mutualFriends} amigos em comum`}
        </Chip>
      )}
      {card.presence !== null && (
        <span className={cn('ml-auto', card.presence === 'online' && 'text-chart-4')}>
          {card.presence === 'online' ? 'Online' : 'Offline'}
        </span>
      )}
    </div>
  );
}

function Chip({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11.5px]">
      {children}
    </span>
  );
}

/** The diamond rule between the blocks of the card. */
export function ProfileCardOrnament({ full }: Readonly<{ full: boolean }>): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'my-3.5 flex items-center gap-2.5 text-[9px] text-primary before:h-px before:flex-1 before:bg-linear-to-r before:from-transparent before:via-primary/45 before:to-transparent after:h-px after:flex-1 after:bg-linear-to-r after:from-transparent after:via-primary/45 after:to-transparent',
        full ? 'mx-6' : 'mx-4.5',
      )}
    >
      ◆
    </div>
  );
}

/** The four attributes: rolls, criticals, tables as master / player and approval.
 *
 *  Example: `<ProfileCardAttributes card={card} full={false} />` */
export function ProfileCardAttributes({ card, full }: CardPartProps): React.JSX.Element {
  const tables = `${card.campaignsAsMaster} / ${card.campaignsAsPlayer}`;
  return (
    <dl className={cn('grid gap-2', full ? 'grid-cols-4 px-6' : 'grid-cols-2 px-4.5')}>
      <Attribute label="Rolagens" value={cardCount(card.rollsCount)} />
      <Attribute
        label="Críticos"
        value={cardCount(card.natural20Count)}
        valueClass="text-primary"
      />
      <Attribute label="Mestre / joga" value={tables} />
      <Attribute
        label="Aprovação"
        value={approvalText(card.reputation)}
        valueClass={
          card.reputation.percent === null ? 'text-sm text-muted-foreground' : 'text-chart-4'
        }
      />
    </dl>
  );
}

function Attribute({
  label,
  value,
  valueClass,
}: Readonly<{ label: string; value: string; valueClass?: string }>): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col-reverse items-center justify-center gap-1 rounded-[10px] border border-border bg-muted/85 px-1.5 py-2.5 text-center">
      <dt className={cn(LABEL_CLASS, 'text-[9px] text-muted-foreground')}>{label}</dt>
      <dd className={cn('font-display text-2xl leading-none font-semibold', valueClass)}>
        {value}
      </dd>
    </div>
  );
}

/** A labeled block of text ("Sobre", "Horários"); nothing when the person left it empty.
 *
 *  Example: `<ProfileCardSection label="Sobre" text={card.bio} />` */
export function ProfileCardSection({
  label,
  text,
}: Readonly<{ label: string; text: string | null }>): React.JSX.Element | null {
  if (!text) return null;
  return (
    <section className="flex min-w-0 flex-col gap-1">
      <h3 className={cn(LABEL_CLASS, 'text-primary')}>{label}</h3>
      <p className="text-[13.5px] leading-relaxed break-words whitespace-pre-line text-label">
        {text}
      </p>
    </section>
  );
}
