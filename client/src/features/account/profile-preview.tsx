import { isHexColor, type MemberColorDto } from '@lorkarium/contracts';
import { useId } from 'react';
import { UserAvatar } from '@/components/user-avatar';
import { UserHandle } from '@/components/user-handle';
import { legibleInkOn } from '@/lib/color-contrast';
import { memberColorCss } from '@/lib/member-color';
import { memberSinceLabel } from '@/lib/member-since';
import type { PlanSealHolder } from '@/lib/plan-seal';

export type ProfilePreviewProps = Readonly<{
  name: string;
  username: string;
  color: MemberColorDto;
  avatarId: string | null;
  bio: string;
  memberSince: string;
  seal: PlanSealHolder;
}>;

/** "Como a galera te vê": the draft as the others will see it, before it is saved, and the ping
 *  in the chosen color on a still mini grid, with the @ and the seal symbol the others see (no animation: it is an illustration, not the board).
 *
 *  Example: `<ProfilePreview {...draft.values} username={profile.username} avatarId={profile.avatarId} memberSince={profile.memberSince} seal={profile} />` */
export function ProfilePreview(props: ProfilePreviewProps): React.JSX.Element {
  const titleId = useId();
  const shownName = props.name.trim() || 'Sem apelido';
  const bio = props.bio.trim();
  return (
    <aside aria-labelledby={titleId} className="flex flex-col gap-5">
      <h3
        id={titleId}
        className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
      >
        Como a galera te vê
      </h3>
      <div className="flex items-center gap-4">
        <UserAvatar name={shownName} color={props.color} avatarId={props.avatarId} size="xl" />
        <div className="min-w-0">
          <p className="truncate font-display text-2xl font-semibold">{shownName}</p>
          <UserHandle
            username={props.username}
            seal={props.seal}
            className="text-[15px] text-muted-foreground"
          />
        </div>
      </div>
      <p className="text-[15px] text-muted-foreground">{memberSinceLabel(props.memberSince)}</p>
      {bio && <p className="max-w-prose text-[15px]/relaxed text-label">{bio}</p>}
      <PingIllustration name={shownName} color={props.color} />
    </aside>
  );
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
