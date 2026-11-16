import { isHexColor, type MemberColorDto, type ProfileCardDto } from '@lorkarium/contracts';
import { useId } from 'react';
import { legibleInkOn } from '@/lib/color-contrast';
import { memberColorCss } from '@/lib/member-color';
import type { PlanSealHolder } from '@/lib/plan-seal';
import { ProfileCardFace } from '@/features/profile-card/profile-card-face';

export type ProfilePreviewProps = Readonly<{
  name: string;
  username: string;
  color: MemberColorDto;
  avatarId: string | null;
  bannerId: string | null;
  bio: string;
  gameSystems: string;
  playSchedule: string;
  contact: string;
  memberSince: string;
  seal: PlanSealHolder;
  /** The account's own badges, in the catalog's order (granted in the backoffice). */
  badges: ProfileCardDto['badges'];
}>;

/** "Como a galera te vê": the draft on the real "Brasão" card (the full one, with systems,
 *  schedule and contact), before it is saved, and the ping in the chosen color on a still mini
 *  grid. The counters are the server's on the real card; here they read zero.
 *
 *  Example: `<ProfilePreview {...draft.values} username={profile.username} avatarId={profile.avatarId} bannerId={profile.bannerId} memberSince={profile.memberSince} seal={profile} badges={profile.badges} />` */
export function ProfilePreview(props: ProfilePreviewProps): React.JSX.Element {
  const titleId = useId();
  const card = previewCardOf(props);
  return (
    <aside aria-labelledby={titleId} className="flex flex-col gap-5">
      <h3
        id={titleId}
        className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
      >
        Como a galera te vê
      </h3>
      <ProfileCardFace card={card} full />
      <PingIllustration name={card.name} color={props.color} />
    </aside>
  );
}

function textOrNull(text: string): string | null {
  return text.trim() || null;
}

function previewCardOf(props: ProfilePreviewProps): ProfileCardDto {
  return {
    id: props.username,
    username: props.username,
    name: props.name.trim() || 'Sem apelido',
    color: props.color,
    avatarId: props.avatarId,
    bannerId: props.bannerId,
    bio: textOrNull(props.bio),
    memberSince: props.memberSince,
    plan: props.seal.plan,
    admin: props.seal.admin,
    lorkariumOwner: props.seal.lorkariumOwner,
    presence: null,
    relation: 'self',
    rollsCount: 0,
    natural20Count: 0,
    campaignsAsMaster: 0,
    campaignsAsPlayer: 0,
    reputation: { up: 0, down: 0, myVote: null, percent: null },
    gameSystems: textOrNull(props.gameSystems),
    playSchedule: textOrNull(props.playSchedule),
    contact: textOrNull(props.contact),
    mutualCampaigns: [],
    mutualFriends: 0,
    badges: props.badges,
  };
}

const GRID_LINES = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220];

const PALETTE_PLATE_INK = '#0c0e11';

function PingIllustration({ name, color }: Readonly<{ name: string; color: MemberColorDto }>) {
  const tone = memberColorCss(color);
  const ink = isHexColor(color) ? legibleInkOn(color) : PALETTE_PLATE_INK;
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox="0 0 240 120" aria-hidden="true" className="w-full bg-panel text-divider">
        {GRID_LINES.map((at) => (
          <line key={`v${at}`} x1={at} y1={0} x2={at} y2={120} stroke="currentColor" />
        ))}
        {GRID_LINES.filter((at) => at < 120).map((at) => (
          <line key={`h${at}`} x1={0} y1={at} x2={240} y2={at} stroke="currentColor" />
        ))}
        <circle cx={120} cy={60} r={22} fill="none" stroke={tone} strokeWidth={2.5} />
        <circle cx={120} cy={60} r={4} fill={tone} />
        <rect x={136} y={22} width={76} height={18} rx={2} fill={tone} />
        <text x={142} y={35} fontSize={11} fontWeight={600} fill={ink}>
          {name.slice(0, 12)}
        </text>
      </svg>
      <figcaption className="text-sm text-placeholder">Seu ping no mapa</figcaption>
    </figure>
  );
}
