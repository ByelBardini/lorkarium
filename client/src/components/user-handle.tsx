import type { PlanSealHolder } from '@/lib/plan-seal';
import { cn } from '@/lib/utils';
import { PlanSeal } from './plan-seal';

export type UserHandleProps = Readonly<{
  username: string;
  /** What the seal is picked from; `null` when the screen does not know it (the @ alone). */
  seal: PlanSealHolder | null;
  className?: string;
}>;

/** A person's @ with their one seal glued on its right, on the same line: every place the app
 *  shows an @ as the person's handle goes through here (not the @ inside a sentence).
 *
 *  Example: `<UserHandle username={member.username} seal={member} className="text-xs" />` */
export function UserHandle({ username, seal, className }: UserHandleProps): React.JSX.Element {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1', className)}>
      <span className="truncate">{`@${username}`}</span>
      {seal && <PlanSeal holder={seal} />}
    </span>
  );
}
