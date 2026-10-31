# Dice-renderer

O desenho 3D dos dados sobre a janela, em three.js. Vive em `packages/dice-renderer/src/`, exportado por `@lorkarium/dice-renderer` (`src/index.ts`). É o **único** lugar do `three` no monorepo. Sem React e sem nada do client: o que é do app (paleta do perfil, cor dos números, endereço da textura) entra pela opção `look`. Usado pelo client por `import()` ([`client/dice.md`](client/dice.md), Dados 3D na janela) e, no plano da landing, pelo `site/` também por `import()`. Specs em `packages/dice-renderer/test/` (Vitest, `jsdom`, three real; sem WebGL). Regra pura dos dados (forma, poses, caixa, trajeto): [`game-core/dados.md`](game-core/dados.md); DTOs: [`contracts/dados.md`](contracts/dados.md).

## Workspace

- `package.json` — `exports: { ".": "./src/index.ts" }` (fonte TS, como o game-core); dependências `three`, `@lorkarium/contracts`, `@lorkarium/game-core`; dev `@types/three`, `jsdom`, `@lorkarium/tsconfig`.
- `tsconfig.json` — `base.json` + `lib` com `DOM` (canvas, `window`); inclui `src`, `test` e `vitest.config.ts`.
- `vitest.config.ts` — projeto `@lorkarium/dice-renderer`, `environment: 'jsdom'`; entra no `projects` da raiz e no `pnpm test:packages`. Sem alias: os specs importam `../src/...`.
- ESLint: globais do navegador (`packages/dice-renderer/**/*.ts` no bloco do `desktop/src` e `site/src`).

## Ponto de entrada (`src/index.ts`)

- Valores: `ThreeDiceRenderer` (a classe), `createThreeDiceRenderer(options)` (faz o `import('three')` e devolve a classe pronta) e `playDiceThrow` (decodifica um arremesso e o prende no relógio local; serve para saber o `settleMs` sem desenhar). O plano chamava este último de `dicePlaybackOf`; o nome real é `playDiceThrow`.
- Tipos: `DiceRenderer`, `DiceRendererRoll`, `DiceRendererFactory`, `PlayingDiceThrow`, `DiceLook`, `ThreeDiceRendererOptions`, `DiceOverlayHost`, `DiceGl`, `DiceGlFactory`.
- Nenhum arquivo importa `three` como valor fora do `import('three')` do `createThreeDiceRenderer`: os outros só têm `import type`. Importar o pacote não puxa o three; quem quer o three fora do bundle inicial importa o **pacote** por `import()` (o client faz isso por um módulo próprio, `app-dice-renderer.ts`, e o Vite gera `app-dice-renderer-*.js` + `three.module-*.js`).

## Opções

- `ThreeDiceRendererOptions` = `{ look: DiceLook; view?: DiceOverlayHost; createGl?: DiceGlFactory; container?: HTMLElement; zoom?: number }`. Sem `view`, a `window`; sem `createGl`, `WebGLRenderer({ canvas, alpha: true, antialias: true })`.
- `container` (o palco do Ato V da landing): o canvas entra **nele** (`position: absolute`, `inset: 0`) em vez do `body`, e o tamanho vem do `clientWidth`/`clientHeight` dele, não da janela. Sem ele, a sobreposição da janela inteira do app.
- `zoom` (1 sem ele): multiplica o `diceStageScaleOf` — desenha o meio da caixa de quem rolou maior. Zoom não positivo → `RangeError` `The dice zoom must be a positive number, got 0`. A landing usa 1,8 com arremessos gravados que assentam no centro (ver [`dice/fisica.md`](dice/fisica.md), Rolagens gravadas).
- `DiceLook` = `{ colorHex, numberColorOf, textureUrlOf }`:
  - `colorHex: Partial<Record<MemberColor, number>>` — o `0xrrggbb` de cada cor de perfil que a página pode receber. O client passa o `MEMBER_COLOR_HEX` inteiro; a landing pode passar só as cores que usa. Cor ausente no `show` → `RangeError` `Dice color "rose" of d20 has no hex in the look: expected colorHex.rose = 0xrrggbb.` (cita a cor, os `kind` da rolagem e a forma esperada). A rolagem recusada **não** fica marcada como mostrada.
  - `numberColorOf(appearance)` — o `#rrggbb` dos números (o client: `diceNumberColorOf`, contraste WCAG).
  - `textureUrlOf(textureId)` — de onde vem a textura enviada (o client: `diceTextureUrlOf`, `/api/dice-textures/<id>`).

## Estrutura (`src/`)

Conta pura (sem `three` e sem WebGL; os tipos de entrada são os DTOs do contracts, `startMs`/`settleMs` no relógio do arremesso, 0 = o evento chegou):

- `dice-renderer.ts` — a porta: `DiceRenderer` (`show(roll)`, `clear()`, `destroy()`), `DiceRendererRoll` `{ rollId, throw, appearance }`, `DiceRendererFactory` (`() => Promise<DiceRenderer>`). `show` repetido com o mesmo `rollId` é ignorado; `clear` tira tudo e o renderer segue usável; `destroy` é final.
- `dice-fade.ts` — `DICE_REST_HOLD_MS` = 3000, `DICE_FADE_MS` = 600, `DICE_VISIBLE_AFTER_SETTLE_MS` = 3600; `diceOpacityAt(settleMs, tMs)`: 1 até `+3000`, linear até 0, `null` em `+3600`. `settleMs` negativo → `RangeError`.
- `dice-playback.ts` — `playDiceThrow(rollId, throw, startedAtMs)` decodifica os quadros uma vez; `settleMs` = o maior dos modelos. `diceSceneAt(arremessos, agora)` → `DiceSceneThrow[]` (pose pelo `poseAt`, onda não lançada fica fora, antes do início ou depois de `settleMs + 3600` fica fora). `isDiceThrowGone`. Modelo sem quadros → `RangeError` citando índice e tipo.
- `box-fit.ts` — `fitDiceBox(aspect, janela)`: a caixa de quem rolou inteira na janela (contain). Aspecto inválido ou janela sem lado → `RangeError`.
- `die-geometry.ts` — `dieGeometryOf(kind)` → `DieGeometry` (memoizado por tipo; os arrays são compartilhados, só leitura): `positions`/`normals` (`Float32Array`, 9 por triângulo) e `uvs` (6 por triângulo), não indexado, cada face em leque anti-horário visto de fora com a normal da face (sombreado chapado). Triângulos: d4 4, d6 12, d8 8, d10/d100tens 20 (pipa = 2), d12 36, d20 20. UV por face: a face projetada no próprio plano, centro em (0,5; 0,5), o maior eixo ocupando [0, 1]. `labels`: `{ text, position, normal, up, size }` — um por face na âncora, `up` no plano da face apontando para o 1º vértice; o d4 tem 3 por face (12), perto de cada canto, com o valor do canto (`vertexValues`). Texto: d100tens com dois dígitos (`00`–`90`), o 10 do d10 como `0`, e `6.`/`9.` nos dados que têm os dois (d10, d12, d20).
- `dice-stage.ts` — `DICE_OVERLAY_Z_INDEX` = 40, `diceStageScaleOf(aspect, janela)` (px por unidade, sobre o `diceBoxOf` do game-core), `labelRightOf(up, normal)`.

Adaptador three.js:

- `three-dice-renderer.ts` — `ThreeDiceRenderer(three, options)`: um `<canvas data-dice-overlay aria-hidden>` no `body` (`fixed`, `inset: 0`, `pointer-events: none`, `z-index: 40`), câmera ortográfica de cima (direita = +x, cima = −z), cada rolagem num grupo escalado por `diceStageScaleOf`. Laço de `requestAnimationFrame` só com rolagem viva; ocioso o canvas fica `display: none`; tamanho relido no quadro (sem listener de `resize`); `setPixelRatio(min(dpr, 2))`.
- `three-dice-meshes.ts` — `ThreeDiceMeshes(three, document, look)`: `BufferGeometry` por tipo, `CanvasTexture` por número + cor, textura enviada por id (`TextureLoader`; falha = fica a cor). `rollObjects(kinds, appearance)` → `{ root, dice, setOpacity, dispose }`, materiais **por rolagem**.

## Testes (`test/`)

- Um spec por fonte (`box-fit`, `dice-fade`, `dice-playback`, `dice-stage`, `die-geometry`, `three-dice-meshes`, `three-dice-renderer`) e `index.spec.ts` (o entry exporta a classe, a fábrica e o `playDiceThrow`; cor ausente no `look` lança citando cor, `kind` e forma).
- `test/support/dice-overlay-host-fake.ts` — `DiceOverlayHostFake` (o `document` do jsdom, relógio e quadros que só rodam no `step(ms)`) e `DiceGlFake` (guarda renders, tamanho, `pixelRatio`, `disposed`).
- `test/support/dice-roll-fixtures.ts` — `TEST_DICE_LOOK` (`ember`/`rose`, números brancos, `/textures/<id>`), `EMBER_HEX`, `ROSE_HEX`, `d20Roll(rollId?, appearance?)` (um d20 rosa parado que assenta em 2400 ms, aspecto 1,78), `D20_ROLL_ID`, `rollIdOf(n)`.
- O jsdom avisa "Not implemented: HTMLCanvasElement's getContext()" nos specs das malhas: o canvas dos números fica em branco e o spec só olha a estrutura (já era assim no client).

## Desempenho

Regra 11 de [`client/performance.md`](client/performance.md): sobreposição ociosa não desenha, e o three só é buscado na primeira rolagem com "Dados 3D" ligado. Um `import` de valor de `three` fora do `import('three')`, ou um `import` estático do **pacote** por um módulo do bundle inicial do client, quebra isso.

## Armadilhas

- `import` estático de valor do pacote (ou das contas do `look`, `MEMBER_COLOR_HEX`, `diceNumberColorOf`) no `client/src/main.tsx` funde o chunk compartilhado `member-color-*.js` (13 kB: as contas de dados do game-core) no `index-*.js` inicial. O `look` do app mora em `client/src/features/dice/app-dice-renderer.ts`, só alcançado por `import()`.
