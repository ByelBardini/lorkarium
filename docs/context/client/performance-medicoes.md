# Client · medições de desempenho do tabuleiro

Detalhe de [`performance.md`](performance.md): os números das regras, antes e depois.

## Medições (`mean` em ms, mediana de 3, mesma máquina)

"Sem memória" é o tabuleiro sem nenhuma das regras acima; "atual", com todas ("olho anda uma casa" atual: uma rodada). O painel (p95 do quadro) ainda não tem número: medir à mão com `?perf=1`.

| Caso                        | Sem memória | Atual  | Orçamento | Regras que seguram |
| --------------------------- | ----------- | ------ | --------- | ------------------ |
| build frio                  | 325         | 41     | —         | 7, 8               |
| só a régua                  | 83          | 0,50   | ≤ 2       | 1, 4               |
| arraste remoto (não olho)   | 313         | 0,53   | ≤ 4       | 1, 2, 3, 4         |
| olho anda uma casa          | 320         | 7,5    | ≤ 8       | 3, 4, 7, 8         |
| `sightArea` alcance 12      | 0,27        | 0,24   | —         | 7                  |
| `sightArea` infinito        | 14,6        | 2,1    | —         | 7                  |
| `lineOfSight` pela masmorra | 0,08        | 0,0004 | —         | 7                  |

Com as 30 auras na cena de estresse (2026-10-25, mediana de 3, outras sessões rodando testes na mesma máquina): só a régua 0,43, arraste remoto 0,45, olho anda uma casa 8,1 (mesma faixa de antes sob carga; sem aura, nas mesmas condições, 6,7 a 8,7), build frio 36,7. "A aura de um token muda" custa 7,6: como todo restyle, o `tokens` novo refaz o filtro de visão (regra 3, chave por identidade); a vista em si só compara a `auraKeyOf` de quem mudou. Antes da cena ter auras: só a régua 0,41 e arraste remoto 0,42.

A imagem de condição (regra 9) fica fora da tabela: a cena de estresse não tem condição com imagem, e o custo na vista é um `assetUrlOf` por condição no `conditionsOf`, dentro da oscilação do bench.

Dados 3D (fase 17, 2026-10-25, uma rodada antes e depois, outras sessões rodando na mesma máquina): antes só a régua 0,68, arraste remoto 0,68, olho anda uma casa 9,8, aura muda 12,1, build frio 49,4; depois 0,37, 0,43, 9,4, 7,3, 36,7. O overlay não entra no caminho do tabuleiro (a diferença é oscilação da máquina, para baixo); a sala parada continua sem quadro dos dados.

No renderer (contado pelo probe, não pelo bench): 1 token mudando entre 300 redesenha 1 (antes, 300 a cada desenho); pan sem zoom redesenha 0 sobreposições (antes, todas a cada tique da roda e a cada quadro de W A S D); uma rajada de eventos no mesmo quadro é 1 desenho.

Chat (retomada em 2026-10-28, uma rodada antes/depois, sob carga de testes): régua 0,80/0,83 ms, arraste remoto 0,63/0,77 ms, olho anda uma casa 12,02/9,48 ms, aura muda 10,68/9,49 ms, build frio 58,77/54,23 ms. Os caminhos locais seguem dentro do orçamento; o olho excede 8 ms nas duas medições sob carga, portanto esta rodada não confirma esse orçamento. O balão não altera `buildBoardView`; sua ociosidade é provada por `pixi-speech-layer.spec.ts`.

Sem bloqueador (2026-11-04, tokens que bloqueiam a visão, mediana de 3, nada mais rodando; "antes" é a mediana de 3 antes de todo o trabalho, na mesma máquina): só a régua 0,249 (antes 0,266), arraste remoto 0,278 (0,292), olho anda uma casa 4,39 (4,56), aura muda 4,29 (4,38), build frio 27,3 (28,0), `sightArea` alcance 12 0,153 (0,164), `sightArea` infinito 1,40 (1,54), `lineOfSight` 0,0002 (0,0002). Lado a lado com a `main`, 5 rodadas alternadas: régua −11%, arraste −9%, aura −7%, olho −11%, frio −9% (nos mínimos: +0,4%, −1,4%, −1,5%, −6,4%, −0,2%): o recurso não custa nada a quem não o usa (regra 12).

Com 50 bloqueadores de 48 vértices (2026-11-04, mediana de 3, nada mais rodando):

| Caso                                | `mean` | p75  | Orçamento | Resultado |
| ----------------------------------- | ------ | ---- | --------- | --------- |
| só a régua                          | 0,371  | 0,30 | ≤ 2       | dentro    |
| arraste remoto (não olho)           | 0,373  | 0,36 | ≤ 4       | dentro    |
| olho anda uma casa                  | 7,38   | 7,22 | ≤ 8       | dentro    |
| bloqueador arrastado uma casa       | 81,1   | 94,6 | ≤ 8       | **10×**   |
| giro de bloqueador com imagem       | 76,7   | 90,1 | —         | como ele  |
| olho e luz em 2 bloqueadores (anda) | 14,5   | 11,0 | —         | —         |

**O bloqueador arrastado estoura o orçamento, e o custo foi aceito (2026-11-04):** só ocorre ao mudar de casa ou de direção, nunca a cada quadro, e a cena de estresse é o pior caso. Reabrir se o painel mostrar travada em mesa real. Onde vai o tempo de um passo (uma rodada): filtro ~12 ms, vistas ~80 ms; o `preparedWalls` de 3300 trechos só ~0,9 ms (900 trechos, ~0,4 ms), então preparar paredes reais e bloqueadores em separado não resolve. A causa é a memória das áreas: o array novo troca o `wallSetIdOf`, e as ~65 luzes acesas da cena mais os olhos voltam todos ao `sightArea`, inclusive os da outra ponta da masmorra. Um `sightArea` de alcance 8 custa 0,73 ms com os 50 e 0,16 ms sem eles. Por isso o custo quase não depende da quantidade (mediana do passo): 1 bloqueador 27 ms, 5 30 ms, 10 37 ms, 25 49 ms, 50 66 ms. O caso "2 bloqueadores" tem o p75 abaixo da média porque a 1ª amostra refaz tudo ao trocar de tabuleiro.

Patrulha (2026-11-08, mediana de 3 antes/depois, com outra sessão rodando testes do server na mesma máquina; "antes" com os 4 arquivos quentes da `HEAD`): régua 0,33/0,43, arraste remoto 0,35/0,42, olho anda uma casa 6,23/6,79, aura muda 5,50/6,31, build frio 36,2/35,8 (dentro da oscilação sob carga). Casos novos ("buildBoardView while patrols walk", `stressPatrolBoardOf`): 20 patrulhas que não são olho nem luz dão um passo 0,77 (orçamento ≤ 4); 20 de olhos ou tochas 6,33 (≤ 8).

Legibilidade do balão (2026-10-28, uma rodada antes/depois sob carga): Hanken 14 semibold substitui a serifa itálica; só o estilo usado ao criar a bolha muda, sem medição de texto por quadro. Régua 0,37/0,66 ms, arraste remoto 0,68/1,05 ms, olho anda uma casa 10,03/10,43 ms, aura muda 13,03/10,44 ms, build frio 39,99/51,09 ms. Os caminhos locais seguem no orçamento; o olho já excedia 8 ms antes. Estes benches não medem rasterização da fonte; os specs conferem zero leitura do relógio e zero construção sem balão, e nenhuma reconstrução/render extra com bolha e câmera paradas.

## Bundle inicial (`client/dist`, linha de base 2026-11)

O que login e home baixam antes de rodar: o chunk de entrada mais os `modulepreload` do `index.html`. Bytes do arquivo e do `gzip -9` (o `.gz` do `precompress`).

| Medida                                                            | PixiJS no bundle inicial | PixiJS por `import()` (regra 15) |
| ----------------------------------------------------------------- | ------------------------ | -------------------------------- |
| chunk de entrada (bruto)                                          | 2 094 962                | 1 215 649                        |
| chunk de entrada (gzip)                                           | 622 784                  | 363 529                          |
| entrada + preloads (bruto)                                        | 2 699 164                | 1 718 927                        |
| entrada + preloads (gzip)                                         | 810 203                  | 523 797                          |
| chunk `pixi-board-renderer` (gzip, sem os chunks que ele importa) | —                        | ≈ 113 000 (só na primeira mesa)  |
