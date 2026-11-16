import type { ProfileCardDto } from '@lorkarium/contracts';
import { cn } from '@/lib/utils';
import {
  ProfileCardAttributes,
  ProfileCardBanner,
  ProfileCardHeader,
  ProfileCardOrnament,
  ProfileCardRelation,
  ProfileCardSection,
} from './profile-card-parts';
import { ProfileCardBadges } from './profile-card-badges';
import { ProfileCardSealWatermark } from './profile-card-seal-watermark';

export type ProfileCardFaceProps = Readonly<{
  card: ProfileCardDto;
  /** The modal: wider, with systems, schedule, contact and the tables in common. */
  full: boolean;
  /** The actions bar and anything under it (the popover's "Ver perfil completo"). */
  children?: React.ReactNode;
  /** Over the banner's top-left corner (the modal's "Buscar @usuário"). */
  corner?: React.ReactNode;
}>;

// The popover stays one row wide; the rest reads as "+N" and the modal shows them all.
const POPOVER_BADGES = 6;

/** The "Brasão" card: golden frame, the seal as a watermark on the right half, banner, avatar,
 *  relation, attributes, badges and the "Sobre"; the profile color only paints the banner.
 *
 *  Example: `<ProfileCardFace card={card} full={false}><ProfileCardActions … /></ProfileCardFace>` */
export function ProfileCardFace(props: ProfileCardFaceProps): React.JSX.Element {
  const { card, full, children } = props;
  return (
    <div
      className={cn(
        'relative isolate overflow-hidden rounded-[14px] border border-transparent [background:linear-gradient(var(--color-card),var(--color-card))_padding-box,linear-gradient(160deg,#e8c88e,#5a4528_35%,var(--color-border)_60%,var(--color-primary))_border-box]',
        full ? 'w-full' : 'w-[350px] max-w-full',
      )}
    >
      <ProfileCardSealWatermark holder={card} />
      <ProfileCardBanner card={card} full={full} />
      {props.corner !== undefined && (
        <div className="absolute top-2.5 left-3 z-10 w-64 max-w-[calc(100%-7rem)]">
          {props.corner}
        </div>
      )}
      <ProfileCardHeader card={card} full={full} />
      <ProfileCardRelation card={card} full={full} />
      <ProfileCardOrnament full={full} />
      <ProfileCardAttributes card={card} full={full} />
      <ProfileCardOrnament full={full} />
      <div className={cn('flex flex-col gap-4 pb-3.5', full ? 'px-6' : 'px-4.5')}>
        <ProfileCardBadges badges={card.badges} limit={full ? undefined : POPOVER_BADGES} />
        <ProfileCardSection label="Sobre" text={card.bio} />
        {full && <FullProfileSections card={card} />}
      </div>
      {children}
    </div>
  );
}

function FullProfileSections({ card }: Readonly<{ card: ProfileCardDto }>): React.JSX.Element {
  return (
    <>
      <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr_1fr]">
        <ProfileCardSection label="Sistemas e cenários" text={card.gameSystems} />
        <ProfileCardSection label="Horários" text={card.playSchedule} />
        <ProfileCardSection label="Contato" text={card.contact} />
      </div>
      {card.mutualCampaigns.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="font-brand text-[10px] font-semibold tracking-[0.14em] text-primary uppercase">
            Mesas em comum
          </h3>
          <ul className="flex flex-wrap gap-2">
            {card.mutualCampaigns.map((campaign) => (
              <li
                key={campaign.id}
                className="min-w-0 flex-1 rounded-lg border border-border bg-muted/85 px-2.5 py-2 text-[12.5px]"
              >
                {campaign.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
