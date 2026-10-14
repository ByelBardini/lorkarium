// As regras transversais do server que não dependem de camada: de onde vem
// env, por onde o db entra, como um VO nasce, quem é o autor de um comando e
// por onde sai o log. Estão em CLAUDE.md, AGENTS.md e docs/spec.md (§7.3,
// §8) — aqui viram achado com arquivo e linha.
import { achado } from '../../refatorar/lib/achados.mjs';
import {
  IDENTIDADE_DESESTRUTURADA,
  IDENTIDADE_LIDA_DO_PAYLOAD,
} from '../../refatorar/lib/arquitetura.mjs';
import { linhaDoPadrao } from './texto.mjs';

const NOMES_DO_DB = /^(db|database|pool|client|connection)$/;

const REGRAS = [
  {
    regra: 'process-env-direto',
    severidade: 'erro',
    padrao: () => /\bprocess\.env\b/,
    isento: (ficha) =>
      ficha.relativo.startsWith('src/config/') || ficha.relativo === 'src/index.ts',
    mensagem: () => 'process.env direto: env só entra pelo schema Zod de src/config/',
    sugestao: () =>
      'acrescente a variável no schema de src/config/env.ts e no server/.env.example, e receba o valor validado por parâmetro',
  },
  {
    regra: 'console-no-server',
    severidade: 'aviso',
    padrao: () => /\bconsole\.(log|info|warn|error|debug)\s*\(/,
    isento: (ficha) => ficha.relativo.startsWith('scripts/'),
    mensagem: () =>
      'console.* em código de produção: o log do server é o pino do Fastify (JSON estruturado)',
    sugestao: () => 'use request.log / app.log, que já carregam o contexto da requisição',
  },
  {
    regra: 'identidade-do-payload',
    severidade: 'erro',
    padrao: () =>
      new RegExp(`${IDENTIDADE_LIDA_DO_PAYLOAD.source}|${IDENTIDADE_DESESTRUTURADA.source}`),
    isento: (ficha) => !/^src\/(modules|realtime|app)\//.test(ficha.relativo),
    mensagem: () =>
      'identidade ou papel lido do que o cliente mandou (spec §7.3: nunca do payload)',
    sugestao: () =>
      'quem pede vem da sessão/conexão autenticada (request.user, socket.data); o service recebe o autor como parâmetro próprio',
  },
  {
    regra: 'vo-por-assercao',
    severidade: 'erro',
    padrao: (contexto) =>
      contexto.nomesDeVo.length === 0
        ? null
        : new RegExp(`\\bas\\s+(?:${contexto.nomesDeVo.join('|')})\\b`),
    isento: (ficha) => ficha.workspace.tipo === 'game-core',
    mensagem: (casado) =>
      `\`${casado}\` escrito à mão: VO nasce pelo construtor do game-core, nunca por \`as\``,
    sugestao: () =>
      'chame o construtor do VO (ele recusa citando o valor recebido); valor que veio da coluna passa pelo mapper, que chama o mesmo construtor',
  },
];

export function analisarContrato(contexto) {
  const comVos = { ...contexto, nomesDeVo: nomesDeVo(contexto) };
  return contexto.doAlvo.flatMap((ficha) => {
    const doServer = ficha.workspace.tipo === 'server';
    const transversais = REGRAS.filter(
      (definicao) => doServer || definicao.regra === 'vo-por-assercao',
    );
    return [
      ...transversais.flatMap((definicao) => aplicar(comVos, ficha, definicao)),
      ...(doServer ? dbImportadoDireto(contexto, ficha) : []),
    ];
  });
}

// Os tipos exportados pelos `*.vo.ts` do game-core: é o que `as X` fura.
function nomesDeVo(contexto) {
  return [...contexto.fichas.values()]
    .filter((ficha) => ficha.workspace.tipo === 'game-core' && ficha.nome.endsWith('.vo.ts'))
    .flatMap((ficha) =>
      ficha.exports
        .filter((item) => ['type', 'interface', 'class'].includes(item.tipo))
        .map((item) => item.nome),
    );
}

function aplicar(contexto, ficha, definicao) {
  if (ficha.ehTeste || definicao.isento(ficha)) return [];
  const padrao = definicao.padrao(contexto);
  if (padrao === null) return [];
  const linha = linhaDoPadrao(ficha, padrao);
  if (linha === null) return [];
  const casado = (padrao.exec(ficha.textoSemComentarios) ?? [''])[0].trim();
  return [
    achado(
      'contrato',
      definicao.regra,
      definicao.severidade,
      ficha,
      linha,
      definicao.mensagem(casado),
      definicao.sugestao(),
    ),
  ];
}

// CLAUDE.md: dependência entra pelo construtor, nunca por import global. O
// DAO recebe o db/tx de quem o monta (o plugin), e assim o teste de
// integração troca o banco e a transação envolve vários DAOs.
function dbImportadoDireto(contexto, ficha) {
  if (/^src\/(database|app)\//.test(ficha.relativo) || ficha.relativo === 'src/index.ts') return [];
  return ficha.imports.flatMap((item) => {
    const destino = item.resolvido ? contexto.fichas.get(item.resolvido) : null;
    if (item.ehTipo || !destino?.relativo.startsWith('src/database/')) return [];
    const singleton = item.nomes.find((nome) => !nome.ehTipo && NOMES_DO_DB.test(nome.local));
    if (!singleton) return [];
    return [
      achado(
        'contrato',
        'db-importado-direto',
        'aviso',
        ficha,
        item.linha,
        `${ficha.nome} importa a instância \`${singleton.local}\` de ${destino.relativo}`,
        'receba o db/tx pelo construtor (o plugin do módulo monta o DAO com o db que o app criou); importe só o tipo `Database`',
      ),
    ];
  });
}
