// Every promise here maps to a shipped feature documented in docs/context/.

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

export interface RequirementCopy {
  label: string;
  value: string;
}

export type ActId = 'cena' | 'grupo' | 'iniciativa' | 'combate' | 'dados' | 'chat';

export interface ActCopy {
  /** The `<section>` id and anchor; lowercase letters only. */
  id: ActId;
  numeral: string;
  title: string;
  lead: string;
  /** Indexes into `features`; every feature belongs to exactly one act. */
  featureIndexes: readonly number[];
}

export interface ConditionCopy {
  name: string;
  /** Rounds left; `null` lasts until someone removes it. */
  rounds: number | null;
}

export interface CombatantCopy {
  name: string;
  detail: string;
  initiative: number;
  hp: number;
  maxHp: number;
  conditions: readonly ConditionCopy[];
  hasTurn: boolean;
}

export interface EncounterCopy {
  round: number;
  combatants: readonly CombatantCopy[];
}

const features: FeatureCopy[] = [
  {
    title: 'Grid de combate',
    icon: 'M3 3h18v18H3Z M3 9h18 M3 15h18 M9 3v18 M15 3v18',
    text: 'Use uma imagem como mapa, ajuste o grid e posicione os tokens. A régua mede distâncias e as áreas de efeito marcam as casas atingidas. O grupo acompanha as mudanças em tempo real.',
  },
  {
    title: 'Iniciativa e rodadas',
    icon: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
    text: 'Acompanhe a ordem de iniciativa e avance os turnos pelo painel de combate. Criaturas que agem juntas podem ocupar uma única entrada na lista.',
  },
  {
    title: 'Condições e duração',
    icon: 'M12 3c3 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-6.5 6-11Z',
    text: 'Marque um personagem como envenenado por duas rodadas e acompanhe a duração durante o combate. Crie as condições usadas pelo seu sistema, com nome, cor e ícone próprios.',
  },
  {
    title: 'Barras de recursos',
    icon: 'M4 7h16 M4 12h11 M4 17h7',
    text: 'Até 8 barras por token para registrar PV, mana, escudo ou sanidade. Defina o nome, a cor e quem pode ver os valores de cada recurso.',
  },
  {
    title: 'Biblioteca de grids',
    icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
    text: 'Prepare as cenas antes da sessão e organize os mapas em pastas. Mantenha cada cena privada até decidir abri-la para os jogadores.',
  },
  {
    title: 'Visão, luz e paredes',
    icon: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    text: 'Desenhe paredes e portas, posicione as luzes e defina o alcance de visão dos tokens. Cada jogador vê o mapa conforme a visão de seus personagens.',
  },
  {
    title: 'Dados 3D na mesa',
    icon: 'm12 3 9 5v8l-9 5-9-5V8Z M3 8l9 5 9-5 M12 13v8 M7.5 5.5l9 5',
    text: 'Monte fórmulas de ataque, dano ou outros testes e salve as que usa com frequência. Os dados rolam sobre o mapa, com opção de vantagem, desvantagem e rolagem secreta.',
  },
  {
    title: 'Chat com o grupo',
    icon: 'M21 11a8 8 0 0 1-8 8H7l-4 3V11a8 8 0 0 1 18 0Z M7 9h10 M7 13h6',
    text: 'Envie mensagens para a mesa, converse em particular ou crie um grupo. Também é possível falar como um personagem, com um balão sobre o token no mapa.',
  },
  {
    title: 'Formas e auras',
    icon: 'M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z',
    text: 'Um druida pode alternar entre sua aparência e a de um lobo mantendo PV e condições. Cada token aceita até 8 formas, além de auras com cor, animação ou imagem.',
  },
  {
    title: 'Fichas programáveis',
    icon: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z M14 3v6h6 M10 13l-2 2 2 2 M14 13l2 2-2 2',
    text: 'Escreva o modelo de ficha do seu sistema em HTML, CSS e JavaScript e dê uma ficha a cada jogador. Ela ajusta as barras do token, rola os dados na mesa e guarda os próprios valores, isolada do resto da página.',
  },
];

// What the staged round of act III shows, in plain words beside the live tracker.
const initiativePoints: string[] = [
  'A rodada e quem vem “a seguir” ficam à vista de toda a mesa',
  'A duração das condições desce a cada turno de quem as sofre',
  'Criaturas que agem juntas ocupam uma linha só',
  'O dano entra direto na barra do token',
];

const combatPoints: string[] = [
  'Até 8 barras por personagem para PV e outros recursos',
  'Visibilidade dos pontos de vida dos inimigos definida pelo mestre',
  'Dano e cura na própria barra: digite −7 para subtrair ou +5 para somar',
];

const dice = {
  kicker: 'Dados',
  title: 'Seus testes, com dados sobre o mapa',
  text: 'Role um ataque com vantagem ou os oito d6 de uma bola de fogo. Quem acompanha a rolagem vê o mesmo lançamento em 3D, e o painel mostra cada dado, os modificadores e o total.',
  points: [
    'Do d4 ao d100, com vantagem, desvantagem e fórmulas próprias',
    'Fórmulas salvas por mesa para repetir ataques e testes frequentes',
    'Rolagens secretas só para quem rolou e os mestres',
  ],
};

const chat = {
  kicker: 'Chat',
  title: 'Converse com a mesa ou em particular',
  text: 'Use o chat da mesa para narrar e combinar as ações do grupo. Para uma conversa reservada, envie um sussurro ou abra um grupo privado: as mensagens ficam entre os participantes, sem acesso automático do mestre.',
  points: [
    'Fale como seu token, com balão de fala no tabuleiro',
    'Use /r para rolar dados e /w para enviar um sussurro',
    'Abra Chat e Dados em janelas separadas; no Windows, mantenha-as sempre visíveis',
  ],
};

// The night of play the landing tells, act by act; feature indexes point into `features`.
const acts: ActCopy[] = [
  {
    id: 'cena',
    numeral: 'I',
    title: 'Prepare a cena',
    lead: 'Antes da sessão, o mapa já está no grid e o ogro espera atrás das árvores. O grupo só vê a cena quando você abrir.',
    featureIndexes: [4, 0, 5],
  },
  {
    id: 'grupo',
    numeral: 'II',
    title: 'Reúna o grupo',
    lead: 'Passe o código da mesa. Quem entra chega como espectador, e você decide quem senta para jogar.',
    featureIndexes: [],
  },
  {
    id: 'iniciativa',
    numeral: 'III',
    title: 'Role a iniciativa',
    lead: 'Lyra age primeiro, os seis bandidos agem juntos e o ogro ainda tem 41 PV. Você só aperta “Próximo turno”.',
    featureIndexes: [1],
  },
  {
    id: 'combate',
    numeral: 'IV',
    title: 'O combate',
    lead: 'Kael acerta 12 de dano, o veneno do ogro desce uma rodada e o druida vira lobo sem perder os PV. Na ficha que você programou, “−5 PV” já cai na barra.',
    featureIndexes: [3, 2, 8, 9],
  },
  {
    id: 'dados',
    numeral: 'V',
    title: 'Os dados',
    lead: 'Role o d20 com vantagem ou os oito d6 da bola de fogo. A mesa inteira vê o mesmo arremesso cair.',
    featureIndexes: [6],
  },
  {
    id: 'chat',
    numeral: 'VI',
    title: 'A conversa',
    lead: 'Narre para a mesa, sussurre para um jogador ou fale como Kael, com o balão sobre o token.',
    featureIndexes: [7],
  },
];

// The demo table "Os Sinos de Vharn" at round 3, the same state as the site captures.
const encounter: EncounterCopy = {
  round: 3,
  combatants: [
    {
      name: 'Lyra',
      detail: 'jogado por Caio',
      initiative: 19,
      hp: 22,
      maxHp: 27,
      conditions: [{ name: 'Concentrando', rounds: null }],
      hasTurn: false,
    },
    {
      name: 'Bandidos ×6',
      detail: '6 de 6 de pé',
      initiative: 15,
      hp: 44,
      maxHp: 66,
      conditions: [],
      hasTurn: false,
    },
    {
      name: 'Kael',
      detail: 'jogado por Caio',
      initiative: 14,
      hp: 38,
      maxHp: 45,
      conditions: [{ name: 'Abençoado', rounds: 8 }],
      hasTurn: false,
    },
    {
      name: 'Ogro das Cinzas',
      detail: 'NPC',
      initiative: 11,
      hp: 41,
      maxHp: 68,
      conditions: [{ name: 'Envenenado', rounds: 2 }],
      hasTurn: true,
    },
    {
      name: 'Thoren',
      detail: 'jogado por Caio',
      initiative: 8,
      hp: 6,
      maxHp: 32,
      conditions: [{ name: 'Abençoado', rounds: 8 }],
      hasTurn: false,
    },
  ],
};

const steps: StepCopy[] = [
  {
    title: 'Peça o convite',
    text: 'O acesso é por convite. Com o link, você escolhe seu nome de usuário e a senha e entra pelo aplicativo para Windows ou pelo navegador.',
  },
  {
    title: 'Passe o código',
    text: 'Crie a mesa, escolha o sistema e envie o código ao grupo. Quem entra pelo código chega como espectador.',
  },
  {
    title: 'Chame para a mesa',
    text: 'Você promove os espectadores a jogadores e define quais tokens cada um controla.',
  },
];

const requirements: RequirementCopy[] = [
  { label: 'Sistema', value: 'Windows 10 ou 11, 64 bits' },
  { label: 'Conta', value: 'Acesso por convite' },
  { label: 'Instalação', value: 'Sem permissão de administrador' },
  { label: 'Internet', value: 'Conexão necessária durante a sessão' },
];

const faqs: FaqCopy[] = [
  {
    question: 'Quanto custa?',
    answer: 'O Lorkarium é gratuito durante o acesso antecipado.',
  },
  {
    question: 'Como consigo uma conta?',
    answer:
      'O acesso é por convite. Solicite um pelo e-mail de contato. Ao receber o link, você poderá criar seu nome de usuário e sua senha.',
    invite: true,
  },
  {
    question: 'Funciona no Mac, no Linux ou no celular?',
    answer:
      'O aplicativo está disponível para Windows 10 e 11. No Mac e no Linux, use o navegador com a mesma conta. Ainda não há suporte para jogar pelo celular.',
  },
  {
    question: 'Os jogadores também precisam baixar?',
    answer:
      'Não. Cada participante pode escolher entre o aplicativo para Windows e o navegador. Com uma conta criada, basta usar o código para entrar na mesa do grupo.',
  },
  {
    question: 'Funciona com qual sistema de RPG?',
    answer:
      'O Lorkarium não aplica as regras de um sistema específico. Você configura barras, condições e iniciativa conforme a mesa, seja de D&D, Tormenta20, Ordem Paranormal ou um sistema próprio, e pode programar a ficha do seu sistema. A interpretação das regras continua com o grupo.',
  },
  {
    question: 'Minhas mesas ficam salvas?',
    answer:
      'Sim. Mapas, tokens, barras, condições, fórmulas de rolagem salvas e a biblioteca de grids ficam na sua conta e podem ser acessados de outro computador. As mensagens e o histórico de resultados dos dados ficam apenas no navegador durante a visita à mesa. Quem entra depois não recebe o histórico anterior.',
  },
  {
    question: 'Posso rolar dados pelo chat?',
    answer:
      'Sim. Digite /r 1d20+5 para uma rolagem pública ou /gr 1d20+5 para uma rolagem visível apenas para você e os mestres. Pela aba Dados, você também pode montar fórmulas, aplicar vantagem ou desvantagem e salvar as rolagens usadas naquela mesa.',
  },
  {
    question: 'Por que o Windows mostra um aviso ao instalar?',
    answer:
      'O SmartScreen pode mostrar o aviso “O Windows protegeu o computador” quando ainda não reconhece o instalador. Se você baixou pelo link deste site, selecione “Mais informações” e depois “Executar assim mesmo” para continuar.',
  },
];

export const landingCopy = {
  features,
  acts,
  encounter,
  initiativePoints,
  combatPoints,
  dice,
  chat,
  steps,
  requirements,
  faqs,
} as const;

/**
 * The act of the landing with this anchor.
 * Example: `actById('iniciativa').numeral // 'III'`
 */
export function actById(id: ActId): ActCopy {
  const act = acts.find((candidate) => candidate.id === id);
  if (!act)
    throw new Error(
      `No landing act with id "${id}"; expected one of ${acts.map((a) => a.id).join(', ')}`,
    );
  return act;
}

export const INVITE_SUBJECT = 'Convite para o Lorkarium';

/**
 * The `mailto:` that asks for an invite, with the subject filled in.
 * Example: `inviteMailto('contato@lorkarium.com.br') // 'mailto:contato@…?subject=Convite%20para%20o%20Lorkarium'`
 */
export function inviteMailto(contactEmail: string): string {
  return `mailto:${contactEmail}?subject=${encodeURIComponent(INVITE_SUBJECT)}`;
}
