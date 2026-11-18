import type { FaqCopy } from '@/copy/landing-copy';
import type { PlanPrices } from '@/lib/plan-price';

// The plans page mirrors the grid of docs/spec.md §3.11. The prices are the catalog of the billing
// service (another repository): change both together. Shown as foreseen until the paid plans open.

export interface PlanCopy {
  name: string;
  pitch: string;
  /** Whether a new account can be on this plan today; the others are not open yet. */
  available: boolean;
  limits: readonly string[];
  /** The seal drawn on the plan (`@lorkarium/brand/seals/<seal>.svg`); Grátis has the logo's crystal. */
  seal: 'logo' | 'apoiador' | 'narrador' | 'lenda';
  /** Null on Grátis. */
  priceCents: PlanPrices | null;
  /** A short line over the highlighted plan. */
  tag?: string;
}

const plans: PlanCopy[] = [
  {
    name: 'Grátis',
    pitch: 'Para conhecer a mesa e jogar com um grupo pequeno. Toda conta nova começa aqui.',
    available: true,
    seal: 'logo',
    priceCents: null,
    limits: [
      '1 mesa como dono e 100 MB de imagens',
      '5 jogadores, 1 co-mestre e 1 espectador por mesa',
      '3 grids e 1 modelo de ficha sem scripts por mesa',
      '5 fichas de NPC por mesa',
      '1 barra e 2 formas por token',
      '10 luzes por cena e 3 abas por documento',
      '3 rolagens salvas e até 8 dados 3D por rolagem',
    ],
  },
  {
    name: 'Apoiador',
    pitch:
      'Para quem apoia o Lorkarium. As mesas seguem o Grátis; a sua conta ganha personalização.',
    available: false,
    seal: 'apoiador',
    priceCents: { mensal: 490, semestral: 2690, anual: 4690 },
    limits: [
      'Mesas com os limites do Grátis',
      'Cor personalizada no perfil, nos dados e nas cores salvas',
      'Textura própria para os seus dados',
      'Foto de perfil em GIF animado',
    ],
  },
  {
    name: 'Narrador',
    pitch: 'Para quem mestra uma ou duas campanhas fixas e quer o tabuleiro completo.',
    available: false,
    seal: 'narrador',
    priceCents: { mensal: 1490, semestral: 7990, anual: 14290 },
    tag: 'Para quem mestra',
    limits: [
      '3 mesas como dono e 1 GB de imagens',
      '8 jogadores, 2 co-mestres e 5 espectadores por mesa',
      '15 grids, 3 mapas interativos e 3 modelos de ficha com scripts por mesa',
      '4 barras e 4 formas por token, 10 abas por documento',
      'Patrulhas e tokens que bloqueiam a visão',
      'Condições com imagem, duplicar grid e cor personalizada na mesa',
      'Capa e banner próprios, e mesa privada',
      'A personalização da conta do Apoiador',
    ],
  },
  {
    name: 'Lenda',
    pitch:
      'Para o mestre dedicado: mesas grandes, campanhas longas e o grupo inteiro com a plateia.',
    available: false,
    seal: 'lenda',
    priceCents: { mensal: 2490, semestral: 13390, anual: 23890 },
    limits: [
      '10 mesas como dono e 5 GB de imagens',
      '20 jogadores, 5 co-mestres e 50 espectadores por mesa',
      'Grids, mapas, modelos e fichas de NPC sem limite no uso normal',
      '8 barras e 8 formas por token, 200 abas por documento',
      'Auras com efeito ou imagem',
      'Foto, capa e banner da mesa em GIF animado',
      'Janelas de Chat e Imagens no app para Windows',
      'Tudo o que o Narrador libera',
    ],
  },
];

const rules: string[] = [
  'Os limites de uma mesa seguem o plano de quem é dono dela e valem para todos que jogam ali.',
  'A personalização da conta (cor, textura do dado, foto animada) segue o plano de cada pessoa.',
  'Trocar de plano não apaga nada: o que passou do limite continua na mesa, só leitura, e o jogo segue. Apagar um item libera a edição do próximo.',
];

const faqs: FaqCopy[] = [
  {
    question: 'Meus jogadores precisam pagar alguma coisa?',
    answer:
      'Não. Os limites de uma mesa seguem o plano de quem é dono dela e valem para todos que jogam ali. Jogador e espectador entram de graça.',
  },
  {
    question: 'Quando os planos pagos abrem?',
    answer:
      'Depois do acesso antecipado, ainda sem data fechada. Use "Me avise quando abrir" no plano que interessa e mandamos um e-mail quando abrir.',
  },
  {
    question: 'Cartão ou Pix, como vai funcionar?',
    answer:
      'O pagamento é feito na página do Mercado Pago. No cartão a assinatura renova sozinha e você cancela a renovação quando quiser, em Minha conta. No Pix você paga o período inteiro de uma vez, sem renovação automática, e avisamos por e-mail antes de vencer.',
  },
  {
    question: 'Se eu voltar para o Grátis, perco minhas mesas?',
    answer:
      'Não. Trocar de plano não apaga nada: mesas, grids e fichas continuam onde estão e o jogo segue. O que passou do limite do Grátis fica só leitura (os mais antigos seguem editáveis), e os scripts das fichas param de rodar até a mesa voltar a um plano pago.',
  },
  {
    question: 'Dá para desistir e pedir o dinheiro de volta?',
    answer:
      'Sim, nos 7 dias seguintes à primeira compra, como manda o Código de Defesa do Consumidor: o valor volta inteiro. Depois disso, cancelar a renovação mantém o plano até o fim do período já pago.',
  },
];

/** The subject of the "Me avise quando abrir" e-mail of one plan.
 *
 * Example: `notifyMailto('contato@lorkarium.com.br', 'Lenda') // 'mailto:…?subject=Me%20avise%20quando%20o%20plano%20Lenda%20abrir'`
 */
export function notifyMailto(contactEmail: string, planName: string): string {
  const subject = `Me avise quando o plano ${planName} abrir`;
  return `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}`;
}

export const plansCopy = { plans, rules, faqs } as const;
