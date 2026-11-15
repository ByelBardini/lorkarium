// The plans page mirrors the grid of docs/spec.md §3.11; no price until plans go on sale.

export interface PlanCopy {
  name: string;
  pitch: string;
  /** Whether a new account can be on this plan today; the others are not open yet. */
  available: boolean;
  limits: readonly string[];
}

const plans: PlanCopy[] = [
  {
    name: 'Grátis',
    pitch: 'Para conhecer a mesa e jogar com um grupo pequeno. Toda conta nova começa aqui.',
    available: true,
    limits: [
      '1 mesa como dono e 100 MB de imagens',
      '6 jogadores, 1 co-mestre e 2 espectadores por mesa',
      '5 grids, 1 mapa interativo e 1 modelo de ficha por mesa',
      '10 fichas de NPC por mesa',
      '2 barras e 2 formas por token',
      '15 luzes por cena e 5 abas por documento',
      '5 rolagens salvas e até 10 dados 3D por rolagem',
    ],
  },
  {
    name: 'Apoiador',
    pitch:
      'Para quem apoia o Lorkarium. As mesas seguem o Grátis; a sua conta ganha personalização.',
    available: false,
    limits: [
      'Mesas com os limites do Grátis',
      'Cor personalizada no perfil, nos dados e nas cores salvas',
      'Textura própria para os seus dados',
      'Foto de perfil em GIF animado',
    ],
  },
  {
    name: 'Narrador',
    pitch: 'Para quem mestra mais de uma campanha e quer o tabuleiro completo.',
    available: false,
    limits: [
      '5 mesas como dono e 2 GB de imagens',
      '10 jogadores, 2 co-mestres e 10 espectadores por mesa',
      '20 grids, 5 mapas interativos e 5 modelos de ficha por mesa',
      '8 barras e 8 formas por token',
      'Patrulhas e tokens que bloqueiam a visão',
      'Auras com efeito ou imagem e condições com imagem',
      'Capa, banner e GIF na mesa, e mesa privada',
      'Janelas de Chat e Imagens no app para Windows',
      'A personalização da conta do Apoiador',
    ],
  },
  {
    name: 'Lenda',
    pitch: 'Para mesas grandes e campanhas longas, com o grupo inteiro e a plateia.',
    available: false,
    limits: [
      '10 mesas como dono e 10 GB de imagens',
      '20 jogadores, 5 co-mestres e 50 espectadores por mesa',
      'Grids, mapas, modelos e fichas de NPC sem limite no uso normal',
      '100 luzes por cena e 200 abas por documento',
      '30 patrulhas por grid e 50 bloqueadores de visão por cena',
      'Tudo o que o Narrador libera',
    ],
  },
];

const rules: string[] = [
  'Os limites de uma mesa seguem o plano de quem é dono dela e valem para todos que jogam ali.',
  'A personalização da conta (cor, textura do dado, foto animada) segue o plano de cada pessoa.',
  'Trocar de plano não apaga nada: o que você já criou continua na mesa e segue editável.',
];

export const plansCopy = { plans, rules } as const;
