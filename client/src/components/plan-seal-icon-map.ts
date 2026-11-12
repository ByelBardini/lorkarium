import type { PlanSealKind } from '@/lib/plan-seal';
import {
  AdminSealIcon,
  AmigoDoDonoSealIcon,
  ApoiadorSealIcon,
  LendaSealIcon,
  LorkariumOwnerSealIcon,
  NarradorSealIcon,
  type SealIconProps,
} from './plan-seal-icons';

/** The icon of each seal kind.
 *
 *  Example: `const Icon = PLAN_SEAL_ICONS[seal.kind]` */
export const PLAN_SEAL_ICONS: Readonly<
  Record<PlanSealKind, (props: SealIconProps) => React.JSX.Element>
> = {
  lorkarium_owner: LorkariumOwnerSealIcon,
  admin: AdminSealIcon,
  apoiador: ApoiadorSealIcon,
  narrador: NarradorSealIcon,
  lenda: LendaSealIcon,
  amigo_do_dono: AmigoDoDonoSealIcon,
};
