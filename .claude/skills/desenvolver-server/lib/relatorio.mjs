// Relatório do driver: mesma forma do /refatorar e do /testar (tabela de
// resumo, seções por categoria, `arquivo:linha` clicável), para o agente não
// aprender um formato por skill.
import { SEVERIDADES, ordenarAchados } from '../../refatorar/lib/achados.mjs';

export const ORDEM_DAS_CATEGORIAS = ['camadas', 'dependencias', 'contrato', 'fatia'];

const ORDEM_DAS_CAMADAS = [
  'routes',
  'gateway',
  'plugin',
  'service',
  'dao',
  'bo',
  'mapper',
  'po',
  'port',
  'error',
  'dto',
  'vo',
  'core',
];

export function montarResumo(achados) {
  const porCategoria = {};
  for (const categoria of ORDEM_DAS_CATEGORIAS)
    porCategoria[categoria] = { erro: 0, aviso: 0, info: 0 };
  for (const item of achados) porCategoria[item.categoria][item.severidade] += 1;
  const total = { erro: 0, aviso: 0, info: 0 };
  for (const contagem of Object.values(porCategoria)) {
    for (const severidade of SEVERIDADES) total[severidade] += contagem[severidade];
  }
  return { porCategoria, total };
}

export function filtrarAchados(achados, opcoes) {
  const minimo = SEVERIDADES.indexOf(opcoes.min ?? 'info');
  return achados.filter(
    (item) =>
      SEVERIDADES.indexOf(item.severidade) <= minimo &&
      (!opcoes.so || opcoes.so.includes(item.categoria)),
  );
}

export function imprimirRelatorio(resultado, opcoes) {
  const linhas = [...cabecalho(resultado), ...tabelaDeResumo(resultado.resumo), ''];
  for (const categoria of ORDEM_DAS_CATEGORIAS) {
    const doGrupo = ordenarAchados(
      resultado.achados.filter((item) => item.categoria === categoria),
    );
    if (doGrupo.length === 0) continue;
    linhas.push(...secao(categoria, doGrupo, opcoes.limite ?? 30), '');
  }
  if (resultado.achados.length === 0) linhas.push('Nenhum achado com os filtros atuais.');
  return linhas.join('\n');
}

function cabecalho({ estatisticas, app, alvo, contextos, camadas }) {
  const numero = (valor) => valor.toLocaleString('pt-BR');
  const inventario = ORDEM_DAS_CAMADAS.filter((camada) => camadas[camada] > 0)
    .map((camada) => `${camada} ${camadas[camada]}`)
    .join(' · ');
  return [
    `desenvolver-server · alvo: ${alvo} · workspace: ${app.nome} (${app.tipo})`,
    `arquivos no alvo: ${numero(estatisticas.arquivosDoAlvo)} (${numero(estatisticas.arquivosDoMonorepo)} no monorepo) · tempo: ${(estatisticas.milissegundos / 1000).toFixed(1)} s`,
    `camadas no alvo: ${inventario === '' ? 'nenhum arquivo com sufixo de camada' : inventario}`,
    contextos.length > 0
      ? `leia antes: ${contextos.join(', ')}`
      : 'leia antes: docs/context/server.md e o docs/context/<área>.md da área (tabela do AGENTS.md); sem doc da área, o docs/spec.md',
    '',
  ];
}

function tabelaDeResumo(resumo) {
  const largura = Math.max(...ORDEM_DAS_CATEGORIAS.map((categoria) => categoria.length));
  const linha = (rotulo, contagem) =>
    `  ${rotulo.padEnd(largura)}  ${String(contagem.erro).padStart(5)} ${String(contagem.aviso).padStart(6)} ${String(contagem.info).padStart(5)}`;
  return [
    `  ${'categoria'.padEnd(largura)}   erro  aviso  info`,
    ...ORDEM_DAS_CATEGORIAS.map((categoria) => linha(categoria, resumo.porCategoria[categoria])),
    linha('total', resumo.total),
  ];
}

function secao(categoria, achados, limite) {
  const contagem = { erro: 0, aviso: 0, info: 0 };
  for (const item of achados) contagem[item.severidade] += 1;
  const mostrados = limite > 0 ? achados.slice(0, limite) : achados;
  const linhas = [
    `## ${categoria} (${achados.length}: ${contagem.erro} erro, ${contagem.aviso} aviso, ${contagem.info} info)`,
  ];
  for (const item of mostrados) {
    linhas.push(
      `  [${item.severidade}] ${item.arquivo}:${item.linha} · ${item.regra} · ${item.mensagem}`,
    );
    if (item.sugestao) linhas.push(`      → ${item.sugestao}`);
  }
  if (mostrados.length < achados.length) {
    linhas.push(`  (+${achados.length - mostrados.length} não mostrados; --limite 0 mostra tudo)`);
  }
  return linhas;
}
