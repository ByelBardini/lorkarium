import type { MapPinIconDto } from '@lorkarium/contracts';
import {
  Anchor,
  Beer,
  Building,
  Castle,
  Church,
  Flag,
  Gem,
  House,
  MapPin,
  Mountain,
  Pickaxe,
  Skull,
  Star,
  Swords,
  Tent,
  TreePine,
  type LucideIcon,
} from 'lucide-react';

/** How each icon of a pin is drawn and called. A `Record`, so a new icon of the contract does not
 *  compile until it has both. */
export const MAP_PIN_ICON_CHOICES: Readonly<
  Record<MapPinIconDto, Readonly<{ label: string; Icon: LucideIcon }>>
> = {
  pin: { label: 'Marcador', Icon: MapPin },
  castle: { label: 'Castelo', Icon: Castle },
  city: { label: 'Cidade', Icon: Building },
  village: { label: 'Vila', Icon: House },
  temple: { label: 'Templo', Icon: Church },
  tavern: { label: 'Taverna', Icon: Beer },
  camp: { label: 'Acampamento', Icon: Tent },
  mine: { label: 'Mina', Icon: Pickaxe },
  forest: { label: 'Floresta', Icon: TreePine },
  mountain: { label: 'Montanha', Icon: Mountain },
  port: { label: 'Porto', Icon: Anchor },
  battle: { label: 'Batalha', Icon: Swords },
  danger: { label: 'Perigo', Icon: Skull },
  treasure: { label: 'Tesouro', Icon: Gem },
  star: { label: 'Destaque', Icon: Star },
  flag: { label: 'Bandeira', Icon: Flag },
};
