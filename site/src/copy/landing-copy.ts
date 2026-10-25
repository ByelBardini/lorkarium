// Every promise here maps to a shipped feature (docs/plans/2026-10-25-tela-landing-download.md,
// "Texto revisado"): dice are out of the MVP (spec §12) and a token takes at most 8 bars.

export interface FeatureCopy {
  title: string;
  text: string;
  /** SVG path data of the 24×24 icon. */
  icon: string;
}

export interface StepCopy {
  title: string;
  text: string;
}

export interface FaqCopy {
  question: string;
  answer: string;
  /** Answers that ask for an invite end with the "Pedir convite" e-mail link. */
  invite?: boolean;
}

export interface AudienceCopy {
  title: string;
  text: string;
}

export interface RequirementCopy {
  label: string;
  value: string;
}

const features: FeatureCopy[] = [
  {
    title: 'Grid de combate',
    icon: 'M3 3h18v18H3Z M3 9h18 M3 15h18 M9 3v18 M15 3v18',
    text: 'Mapa com grid, tokens que andam casa por casa, régua com distância e áreas de efeito. Tudo sincronizado com a galera na hora.',
  },
  {
    title: 'Iniciativa e rodadas',
    icon: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
    text: 'Ordem de iniciativa, contador de rodadas e um botão pra passar a vez. Inimigos iguais entram numa linha só.',
  },
  {
    title: 'Condições que contam sozinhas',
    icon: 'M12 3c3 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-6.5 6-11Z',
    text: 'Envenenado por 2 rodadas? O Lorkarium conta e avisa quando acaba. Invisível e inconsciente mudam o jeito do token no mapa.',
  },
  {
    title: 'Barras pra tudo',
    icon: 'M4 7h16 M4 12h11 M4 17h7',
    text: 'Até 8 barras por token: PV, mana, escudo, sanidade. Você escolhe a cor e quem vê os números.',
  },
  {
    title: 'Biblioteca de grids',
    icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
    text: 'Prepara os mapas antes, organiza em pastas e deixa privado até a hora da surpresa. Depois é só levar o grupo pra lá.',
  },
  {
    title: 'Visão, luz e paredes',
    icon: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    text: 'Tokens enxergam no escuro ou carregam tocha. Paredes bloqueiam a visão e portas abrem na hora certa.',
  },
];

const audience: AudienceCopy[] = [
  {
    title: 'Pro mestre que prepara',
    text: 'Deixa os grids prontos na biblioteca e solta cada um na hora certa.',
  },
  {
    title: 'Pra galera que joga junto',
    text: 'Um código no grupo e todo mundo cai na mesma mesa.',
  },
  {
    title: 'Pra qualquer sistema',
    text: 'D&D, Tormenta20, Ordem Paranormal ou aquele que vocês inventaram.',
  },
];

const combatPoints: string[] = [
  'Até 8 barras por personagem: PV, mana, escudo, sanidade…',
  'Mestre decide o que os jogadores veem da vida dos inimigos',
  'Dano e cura direto na barra: −7 tira, +5 soma',
];

const steps: StepCopy[] = [
  {
    title: 'Baixa e instala',
    text: 'O instalador pra Windows faz tudo sozinho, sem pedir administrador. Abre o Lorkarium e entra com a conta do seu convite.',
  },
  {
    title: 'Cria a mesa',
    text: 'Dá um nome, escolhe o sistema e manda o código no grupo. Quem tiver conta e o código entra.',
  },
  {
    title: 'Bora jogar',
    text: 'Abre um grid, coloca os tokens e rola iniciativa. O resto você ajusta no caminho.',
  },
];

const requirements: RequirementCopy[] = [
  { label: 'Sistema', value: 'Windows 10 ou 11, 64 bits' },
  { label: 'Navegador', value: 'Nada a instalar: usa o WebView2, que já vem no Windows' },
  { label: 'Instalação', value: 'Sem precisar de administrador' },
  { label: 'Internet', value: 'Conexão estável pra jogar online' },
];

const faqs: FaqCopy[] = [
  {
    question: 'Quanto custa?',
    answer: 'Nada: o Lorkarium é grátis enquanto está em acesso antecipado.',
  },
  {
    question: 'Como consigo uma conta?',
    answer:
      'Por enquanto o acesso é por convite. Com o convite, você escolhe seu @ e sua senha e já entra.',
    invite: true,
  },
  {
    question: 'Tem pra Mac, Linux ou celular?',
    answer:
      'O app é pra Windows 10 e 11. No Mac e no Linux dá pra jogar pelo navegador, com a mesma conta. No celular, ainda não.',
  },
  {
    question: 'Os jogadores também precisam baixar?',
    answer:
      'Não precisa: cada um escolhe entre o app pra Windows e o navegador, e todo mundo entra na mesma mesa pelo código.',
  },
  {
    question: 'Funciona com qual sistema de RPG?',
    answer:
      'Com qualquer um. Barras, condições e iniciativa são configuráveis, então dá pra usar com D&D, Tormenta20, Ordem Paranormal ou um sistema próprio.',
  },
  {
    question: 'Minhas mesas ficam salvas?',
    answer:
      'Ficam. Mapas, tokens, barras e a biblioteca de grids ficam guardados na sua conta, então você retoma de onde parou, até em outro computador.',
  },
  {
    question: 'O Windows avisou que o app pode ser perigoso. E agora?',
    answer:
      'É o SmartScreen, que avisa sobre apps novos. Clica em “Mais informações” e depois em “Executar assim mesmo”.',
  },
];

export const landingCopy = { features, audience, combatPoints, steps, requirements, faqs } as const;

export const INVITE_SUBJECT = 'Convite para o Lorkarium';

/**
 * The `mailto:` that asks for an invite, with the subject filled in.
 * Example: `inviteMailto('contato@lorkarium.com.br') // 'mailto:contato@…?subject=Convite%20para%20o%20Lorkarium'`
 */
export function inviteMailto(contactEmail: string): string {
  return `mailto:${contactEmail}?subject=${encodeURIComponent(INVITE_SUBJECT)}`;
}
