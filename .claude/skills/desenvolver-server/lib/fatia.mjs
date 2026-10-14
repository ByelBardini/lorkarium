// A fatia terminou de ser ligada? Camada certa e seta certa não adiantam se a
// rota não está no plugin do módulo, o plugin não está no app ou a regra
// nasceu sem spec. São os esquecimentos que o typecheck não pega: a rota que
// responde 404 e o evento que ninguém escuta.
import path from 'node:path';
import { achado } from '../../refatorar/lib/achados.mjs';
import { camadaDe } from './camadas.mjs';

export function analisarFatia(contexto) {
  return [
    ...contexto.doAlvo.flatMap((ficha) => ligacaoDaFicha(contexto, ficha)),
    ...modulosSemPlugin(contexto),
    ...regrasSemSpec(contexto),
  ];
}

function importadores(contexto, ficha) {
  return [...ficha.importadoPor]
    .map((caminho) => contexto.fichas.get(caminho))
    .filter((outra) => !outra.ehTeste);
}

function ligacaoDaFicha(contexto, ficha) {
  if (ficha.workspace.tipo !== 'server') return [];
  const camada = camadaDe(ficha.relativo);
  if (camada === 'plugin') return pluginNoApp(contexto, ficha);
  if (camada === 'routes' || camada === 'gateway') return bordaNoPlugin(contexto, ficha, camada);
  return [];
}

function pluginNoApp(contexto, ficha) {
  const registrado = importadores(contexto, ficha).some(
    (outra) => outra.relativo.startsWith('src/app/') || outra.relativo === 'src/index.ts',
  );
  if (registrado) return [];
  return [
    achado(
      'fatia',
      'plugin-fora-do-app',
      'erro',
      ficha,
      1,
      `${ficha.nome} não é importado por src/app/: o Fastify nunca registra o módulo`,
      'registre o plugin no app (src/app/) passando as dependências que ele monta (db, portas)',
    ),
  ];
}

function bordaNoPlugin(contexto, ficha, camada) {
  const ligada = importadores(contexto, ficha).some(
    (outra) => camadaDe(outra.relativo) === 'plugin',
  );
  if (ligada) return [];
  const regra = camada === 'routes' ? 'rotas-fora-do-plugin' : 'gateway-fora-do-plugin';
  const sintoma = camada === 'routes' ? 'as rotas respondem 404' : 'nenhum evento chega ao handler';
  return [
    achado(
      'fatia',
      regra,
      'erro',
      ficha,
      1,
      `${ficha.nome} não é importado por nenhum *.plugin.ts: ${sintoma}`,
      `ligue em ${pluginEsperado(ficha)}`,
    ),
  ];
}

// Pasta de primeiro nível em src/modules/ é uma feature, e feature tem plugin.
function modulosSemPlugin(contexto) {
  const pastas = new Map();
  for (const ficha of contexto.doAlvo) {
    const partes = ficha.relativo.split('/');
    if (
      ficha.workspace.tipo !== 'server' ||
      partes[0] !== 'src' ||
      partes[1] !== 'modules' ||
      partes.length < 4
    )
      continue;
    const pasta = `src/modules/${partes[2]}`;
    if (!pastas.has(pasta)) pastas.set(pasta, ficha);
  }
  return [...pastas].flatMap(([pasta, primeira]) => {
    const temPlugin = [...contexto.fichas.values()].some(
      (ficha) =>
        ficha.workspace === primeira.workspace &&
        ficha.relativo.startsWith(`${pasta}/`) &&
        ficha.nome.endsWith('.plugin.ts'),
    );
    if (temPlugin) return [];
    return [
      achado(
        'fatia',
        'modulo-sem-plugin',
        'erro',
        primeira,
        1,
        `${pasta} não tem *.plugin.ts: feature nova é pasta em src/modules/ com plugin próprio`,
        `crie ${pasta}/${path.posix.basename(pasta)}.plugin.ts montando DAO, service e bordas, e registre-o em src/app/`,
      ),
    ];
  });
}

// A regra pura é o teste mais barato do repo, e o único que prova a decisão
// sem banco: BO, VO e DTO com regra própria nascem com spec espelhado.
function regrasSemSpec(contexto) {
  return contexto.doAlvo.flatMap((ficha) => {
    const exigencia = exigenciaDeSpec(ficha);
    if (!exigencia) return [];
    const espelho = `test/${ficha.relativo.replace(/^src\//, '').replace(/\.ts$/, '')}.spec.ts`;
    const existe = [...contexto.fichas.values()].some(
      (outra) => outra.workspace === ficha.workspace && outra.relativo === espelho,
    );
    if (existe) return [];
    return [
      achado(
        'fatia',
        exigencia,
        'aviso',
        ficha,
        1,
        `${ficha.nome} não tem spec em ${ficha.workspace.pasta}/${espelho}`,
        `rode \`/testar ${ficha.relativoAoRepo}\`: cenários do contrato, vermelho primeiro e a prova de que o it morde`,
      ),
    ];
  });
}

function exigenciaDeSpec(ficha) {
  const camada = camadaDe(ficha.relativo);
  if (ficha.workspace.tipo === 'server' && camada === 'bo') return 'bo-sem-spec';
  if (ficha.workspace.tipo === 'game-core' && camada === 'vo') return 'vo-sem-spec';
  const dtoComRegra = /\.(?:refine|superRefine|transform|check)\(/.test(ficha.textoSemComentarios);
  if (ficha.workspace.tipo === 'contracts' && dtoComRegra) return 'dto-com-regra-sem-spec';
  return null;
}

function pluginEsperado(ficha) {
  const partes = ficha.relativo.split('/');
  return partes[1] === 'modules' && partes.length > 3
    ? `src/modules/${partes[2]}/${partes[2]}.plugin.ts`
    : 'o plugin do módulo';
}
