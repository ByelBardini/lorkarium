/** What the `LEIA-ME.txt` of one archive needs to know beyond the fixed text. */
export type ExportReadmeFacts = Readonly<{
  username: string;
  exportedAt: Date;
  /** Paths listed in `dados.json` whose bytes the storage no longer had. */
  missingImages: readonly string[];
}>;

const PARTS_GUIDE = [
  'O que tem neste arquivo',
  '',
  'dados.json: tudo o que o Lorkarium guarda sobre a sua conta, em JSON:',
  '  account: a conta (@, apelido, e-mail, papel, plano, datas, aceite dos Termos, 2FA ligado ou não).',
  '  profile: o perfil (cor, bio, preferências de jogo, contadores dos dados e as imagens).',
  '  savedColors, friends, friendRequests, blocks: cores salvas, amigos, pedidos e bloqueios que você fez.',
  '  reputation: os votos que você deu e, dos que recebeu, só o resumo (os votos são de outras pessoas).',
  '  reportsMade e sanctions: as denúncias que você fez e as medidas que recebeu, com a contestação.',
  '  feedback: os relatos de bug e sugestões que ainda esperam análise (os prints não entram).',
  '  badges: as insígnias da conta.',
  '  campaigns, characters, sheets, documents, savedRolls: as mesas em que você está, o seu papel,',
  '    os seus personagens, as fichas deles, os documentos que são seus ou que você escreveu e as rolagens salvas.',
  '  sessions: os aparelhos conectados agora.',
  '  images: as imagens que você enviou às mesas em que está; os arquivos estão em imagens/.',
  '',
  'imagens/perfil/: a sua foto, o banner e a textura dos dados.',
  'imagens/mesas/<mesa>/: as imagens que você enviou, uma pasta por mesa.',
];

const LEFT_OUT = [
  '',
  'O que não está aqui, e por quê',
  '',
  '- Dados de pagamento: ficam no serviço de cobrança. Baixe em Minha conta, botão "Dados de pagamento".',
  '- Senha, segredo do app autenticador, códigos de recuperação e chaves de sessão: nunca saem do servidor.',
  '- Denúncias feitas sobre você: protegem quem denunciou.',
  '- Chat da mesa e mensagens privadas: não são guardados no servidor.',
  '- Conteúdo de mesas em que você não está mais.',
];

/** The `LEIA-ME.txt` of the archive, in pt-BR: what each part is, what is left out and why, and
 *  the images the storage no longer had (one line each, so the archive still comes whole).
 *
 *  Example: `exportReadmeOf({ username: 'bia', exportedAt, missingImages: [] })` */
export function exportReadmeOf(facts: ExportReadmeFacts): string {
  const header = [
    `Seus dados do Lorkarium (@${facts.username})`,
    `Gerado em ${facts.exportedAt.toISOString()} (UTC).`,
    '',
  ];
  return [...header, ...PARTS_GUIDE, ...LEFT_OUT, ...missingLinesOf(facts.missingImages), ''].join(
    '\r\n',
  );
}

function missingLinesOf(missing: readonly string[]): string[] {
  if (missing.length === 0) return [];
  const lines = missing.map((path) => `- ${path}: o arquivo não estava mais no armazenamento.`);
  return ['', 'Imagens que não puderam ser incluídas', '', ...lines];
}

/** The name the browser saves the archive under: the @ and the UTC day.
 *
 *  Example: `exportFileNameOf('bia', new Date('2026-11-19T14:30:00Z')) // 'lorkarium-dados-bia-2026-11-19.zip'` */
export function exportFileNameOf(username: string, exportedAt: Date): string {
  return `lorkarium-dados-${username}-${exportedAt.toISOString().slice(0, 10)}.zip`;
}
