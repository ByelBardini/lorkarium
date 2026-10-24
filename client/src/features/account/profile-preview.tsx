import type { MemberColor } from '@lorkarium/game-core';
import { useId } from 'react';
import { UserAvatar } from '@/components/user-avatar';
import { memberColorCss } from '@/lib/member-color';
import { memberSinceLabel } from '@/lib/member-since';

export type ProfilePreviewProps = Readonly<{
  name: string;
  username: string;
  color: MemberColor;
  avatarId: string | null;
  bio: string;
  memberSince: string;
}>;

/** "Como a galera te vê": the draft as the others will see it, before it is saved, and the ping
 *  in the chosen color on a still mini grid (no animation: it is an illustration, not the board).
 *
 *  Example: `<ProfilePreview {...draft.values} username={profile.username} avatarId={profile.avatarId} memberSince={profile.memberSince} />` */
export function ProfilePreview(props: ProfilePreviewProps): React.JSX.Element {
  const titleId = useId();
  const shownName = props.name.trim() || 'Sem apelido';
  const bio = props.bio.trim();
  return (
    <aside aria-labelledby={titleId} className="flex flex-col gap-4 border-l border-divider pl-6">
      <h3
        id={titleId}
        className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
      >
        Como a galera te vê
      </h3>
      <div className="flex items-center gap-3">
        <UserAvatar name={shownName} color={props.color} avatarId={props.avatarId} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-semibold">{shownName}</p>
          <p className="text-sm text-muted-foreground">@{props.username}</p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{memberSinceLabel(props.memberSince)}</p>
      {bio && <p className="max-w-prose text-sm text-label">{bio}</p>}
      <PingIllustration name={shownName} color={memberColorCss(props.color)} />
    </aside>
  );
}

const GRID_LINES = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220];

function PingIllustration({ name, color }: Readonly<{ name: string; color: string }>) {
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox="0 0 240 120" aria-hidden="true" className="w-full bg-panel text-divider">
        {GRID_LINES.map((at) => (
          <line key={`v${at}`} x1={at} y1={0} x2={at} y2={120} stroke="currentColor" />
        ))}
        {GRID_LINES.filter((at) => at < 120).map((at) => (
          <line key={`h${at}`} x1={0} y1={at} x2={240} y2={at} stroke="currentColor" />
        ))}
        <circle cx={120} cy={60} r={22} fill="none" stroke={color} strokeWidth={2.5} />
        <circle cx={120} cy={60} r={4} fill={color} />
        <rect x={136} y={22} width={76} height={18} rx={2} fill={color} />
        <text x={142} y={35} fontSize={11} fontWeight={600} fill="#0c0e11">
          {name.slice(0, 12)}
        </text>
      </svg>
      <figcaption className="text-[13px] text-placeholder">Seu ping no mapa</figcaption>
    </figure>
  );
}
