# Client · zoom do tabuleiro

Hub: [`../client.md`](../client.md). Como o zoom fica leve (assentamento, recorte pela faixa), como o tabuleiro volta quando a GPU derruba o contexto e os números de antes e depois. As regras que seguram isso estão em [`performance.md`](performance.md) (5 e 13); os módulos, em [`board-renderer.md`](board-renderer.md).

## Assentamento do zoom (regra 13)

- O gesto (pinça, Ctrl/⌘ + roda, botão, `+`/`-`) só **move e escala o container do mundo** no `applyCamera`. Nada que dependa do zoom redesenha no handler.
- `zoom-settle.ts` (puro) — `zoomSettleOf({ drawnZoom, zoom, stillForMs })` → `idle` (zoom já desenhado) | `wait` | `redraw`: redesenha quando o zoom fica parado `ZOOM_SETTLE_MS` (120 ms) **ou** se afasta `ZOOM_DRIFT_RATIO` (1,25, pela razão, para aproximar e afastar) do último zoom desenhado. Um passo do botão é exatamente 1,25: assenta no mesmo quadro. Zoom ≤ 0 lança.
- `FrameWork` guarda o zoom e o instante de cada `cameraChanged({ zoom, gridBandLeft, atMs })`; `take(agoraMs)` devolve `FrameJob { view, overlays, grid, zoom }`. `zoom: true` (assentou) marca sobreposições e grade; **qualquer** redesenho de sobreposições (vista nova, faixa saída) assenta junto, porque elas já saem no zoom atual. `pending()` fica `true` enquanto um zoom espera, para o `flush` voltar no próximo quadro.
- No `flush`: `job.zoom` → `tokens.applyZoom` (as faixas de condição), a grade com a faixa recalculada do zero (`drawGrid(…, fresh)`: aproximar encolhe a faixa) e as sobreposições.
- A intenção `cameraChanged` sai **uma vez por quadro** (`reportCamera` no `ticker`), não por evento de roda: cada uma é um `set` do Zustand, e a pinça manda vários eventos por quadro.
- **Só o rótulo do zoom assina o `zoom`** (`ZoomLabel` em `board-toolbar.tsx`). O `reportCamera` roda dentro do quadro do ticker, então o React que ele dispara cai na **mesma tarefa** do redesenho assentado e do `render` do Pixi. Com a barra inteira assinando o `zoom`, os 15 `ToolButton` com tooltip redesenhavam a cada quadro do gesto (30–60 ms em dev), e cada assentamento virava uma long task. Componente novo que assine o `zoom` (ou outro campo que muda a cada quadro) fica pequeno e folha. Prova: `board-toolbar.spec.tsx`, "a zoom change draws only the zoom label again".

## Recorte pela faixa

- As sobreposições usam a **mesma faixa da grade** (`gridBandFor`: a vista + uma tela de margem de cada lado, cortada na cena; `PixiSceneGrid.bandWorld()`). `PixiBoardOverlays.draw(view, zoom, faixa)` desenha só `wallsInBand`, `doorsInBand` (`wall-view.ts`) e `lightsInBand` (`light-view.ts`); cone, contorno do bloqueador, régua, alças e o realce do apagar ficam sem recorte.
- `wallsInBand`: a parede fica **inteira** se algum trecho cruza a faixa (Liang–Barsky; a diagonal que passa longe do canto sai); o tracejado não recomeça no meio. `lightsInBand`: o ícone na faixa ou a caixa envolvente das áreas (`dim`/`bright`) cruzando-a. Nada fora → **o mesmo array** (`keptInBand`). Os auxiliares `bandOrThrow`, `pointInBand`, `keptInBand` moram em `grid-geometry.ts`.
- Sair da faixa (`gridBandLeft`) marca grade **e** sobreposições.
- A grade é `pixelLine: true` (1 px de tela em qualquer escala, sem `1/zoom`).

## Perda de contexto WebGL

- `followContextLoss(canvas, onLost)` (`host-listeners.ts`) escuta `webglcontextlost`, chama `preventDefault()` e avisa. O `PixiBoardRenderer` para o `ticker` e emite `{ kind: 'boardLost' }`.
- `BoardRenderer.camera()` (lida mesmo depois da perda) e `mount(host, { camera })` (com câmera, o primeiro `draw` aplica ela em vez de `fitScene`).
- `use-mounted-renderer.ts` (`features/board/`) intercepta `boardLost` antes do `onIntent` da sala (só do renderer atual). `ContextLossBudget` (`src/lib/context-loss-budget.ts`, relógio injetado; 3 perdas em 60 s): `remount` → guarda a câmera, nova geração, o efeito destrói o velho e monta o novo nela; a linha de status recebe "O tabuleiro foi recarregado." (`say`). `give-up` → "Seu navegador não conseguiu abrir o tabuleiro." com o botão "Recarregar tabuleiro" (`retry`: zera o orçamento e remonta na última câmera). Desmontar no meio da remontagem não deixa renderer vivo. O `BoardCanvas` aceita `lossClock` para o spec; o fake tem `lose()`, `mountedCamera`, `cameraNow`.
- E2e: `e2e/test/board.spec.ts`, "the board comes back after losing its WebGL context, at the same zoom" (`WEBGL_lose_context` pelo `page.evaluate`).

## Texto com textura limitada

`textResolutionFor(dpr, fontSize)` (`camera.ts`): o `zoomProofTextResolution` (4 × dpr) cortado só o bastante para o lado da textura (`fontSize × 1,3 × r`) caber em 2048 px. Usado no "Zz" do sono (`pixi-token-look.ts`), cujo tamanho acompanha o token; as iniciais saíram do `Text` e são `BitmapText` sobre um atlas só (`pixi-initials-font.ts`: Hanken 600 em 32 px, resolução 4 — a do zoom máximo —, página de 2048 px; acima de 32 px de fonte, num token grande, o glifo é ampliado); o resto do texto continua no `zoomProofTextResolution`. Um token 10 × 10 (fonte 192) ainda não corta; corta a partir de ~263 px de fonte em dpr 1,5.

## Medições

Mesa de estresse (Bia, mestre), `pnpm dev`, pane do app 800 × 600, dpr 1. Gesto roteirizado: 360 eventos Ctrl + roda (`deltaY` 8, um por quadro) do enquadramento até 400% e de volta a 25%. "Antes" = o renderer que redesenhava tudo a cada evento de roda, na mesma máquina e com o mesmo roteiro.

| Gesto de zoom                     | Antes        | Depois       |
| --------------------------------- | ------------ | ------------ |
| FPS do painel durante o gesto     | 33–37        | 61–66        |
| p95 do painel (ms)                | 36–48        | 24–36        |
| sobreposições / s (grade igual)   | 30–39        | 2–5          |
| quadro do roteiro p50 / p95 / máx | 27 / 44 / 71 | 14 / 30 / 49 |
| long tasks (soma)                 | 6 (373 ms)   | 0            |
| `zoom.event` / s                  | —            | 59–65        |

- **Rótulo do zoom isolado** (relato: "piorou num PC mais fraco"), medido contra a `main` `b0895454`. Chromium do Playwright headless na GPU real (RTX 4060 Ti, D3D11), 1280 × 800, Mesa de estresse, Ctrl + roda por roteiro (trackpad: `deltaY 8` por quadro; mouse: 14 cliques de `deltaY 100` ou `125` para dentro e 14 para fora). Média de 3 rodadas (1×) ou 2 (CPU 4× pelo `Emulation.setCPUThrottlingRate`). O teste `deltaY 125` (≥ 1,25 por clique, sem assentamento) era o único caso em que o assentamento perdia para o renderer antigo; o perfil das long tasks mostrou `workLoopSync` em 30–60 ms de cada uma.

| CPU 4×: FPS · p95 (ms)       | `main`    | rótulo isolado |
| ---------------------------- | --------- | -------------- |
| Trackpad, `deltaY 8`/quadro  | 4,5 · 583 | 14,9 · 258     |
| Mouse, `deltaY 100` a 80 ms  | 4,6 · 583 | 29,9 · 108     |
| Mouse, `deltaY 100` a 200 ms | 6,6 · 442 | 44,0 · 42      |
| Mouse, `deltaY 125` a 80 ms  | 7,5 · 358 | 30,7 · 92      |

Sem limitar a CPU, os dois ficam perto de 60 FPS; a correção zera as long tasks (era 0,3–1,3 por gesto). Script em scratchpad, não versionado: abre a mesa nas duas portas e dispara `WheelEvent` no canvas.

- Memória de textura parada: **56,9 MB** (305 texturas). Uma de 2048² em resolução 0,32 (névoa/luz, 16 MB) e ~300 de texto de 512 × 256 em resolução 4 (0,5 MB cada, **~40 MB, ~71%**). Nenhum texto passa de 2048 px de lado: o `textResolutionFor` não alcança esses textos pequenos, e baixar a resolução das iniciais trocaria nitidez por memória. Depois, as iniciais dividem o atlas (uma página de 2048², ~16 MB, mais 1/3 de mipmap do Pixi), no lugar dos ~300 textos: medir o `texture.mb` de novo.
- `strip.redraw` ficou 0: o seed de estresse não tem condições.
- A tela branca **não reproduziu** (nenhum `CONTEXT_LOST_WEBGL` no console). Reabrir com o relato de quem viu: navegador, GPU, tamanho da cena e zoom.
- O zoom não passa pelo `buildBoardView`: o bench não muda com ele (compare sempre com o `sightArea` do game-core na mesma rodada para separar a máquina do código).

## Armadilhas

- **O recorte é do desenho, nunca da escolha**: `doorIconAt`, `topLightAt`, `wallTargetAt` e as alças leem a `view` inteira. Uma porta fora da faixa não é desenhada, mas o clique nela (depois de um pan que ainda não saiu da faixa) continua valendo.
- **Nunca contar com `webglcontextrestored`**: o Pixi não restaura render textures (névoa, tinta) e falha em perdas repetidas; o tabuleiro se recria a partir dos stores.
