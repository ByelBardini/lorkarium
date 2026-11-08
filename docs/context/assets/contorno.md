# Contorno da imagem (`assets.sight_outline`)

A silhueta recortada de uma imagem de token, usada para o token bloquear a visão pela forma. Só o traçado, o registro e a leitura moram aqui; a forma por caso, a pose e as paredes são do game-core (`sight-outline.vo.ts`, `sight-blocker.ts`, ver [`../game-core/visao-e-luz.md`](../game-core/visao-e-luz.md)).

## Formato

Lista de polígonos, cada um uma lista de pontos `[x, y]` em casa unitária (0 a 1), com a imagem **contida e centrada** nela (uma imagem 200 × 100 opaca vai de y 0,25 a y 0,75). No máximo 4 ilhas e 48 vértices no total, ao menos 3 pontos por polígono.

| Valor     | Significa                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------- |
| polígonos | a silhueta                                                                                     |
| `[]`      | nada na imagem chegou a uma ilha de 1%: toda transparente, ou só com manchas pequenas e soltas |
| `null`    | sem contorno: enviada antes do recurso (migração `0080`, sem reprocessar) ou outra finalidade  |

## Traçado (`server/src/infrastructure/image-processor/alpha-outline.ts`)

`outlineOfAlpha({ width, height, alpha }) → TracedOutline`, puro e sem `sharp`, sobre um byte de alfa por célula. O adaptador fala tipo próprio (`TracedPoint`, `TracedOutline`), porque adaptador não importa módulo. Uma grade cujo `alpha` não bate com `width × height` → `RangeError` citando os dois.

1. **Limiar:** alfa ≥ 128 é sólido (127 fora, 128 dentro).
2. **Buracos preenchidos:** o que o lado de fora não alcança (por 4 vizinhos) vira sólido. Assim todo contorno é externo: um anel dá só o contorno de fora, e uma mancha dentro do anel some com ele. Para quem está fora, o raio bate no contorno externo antes de chegar ao buraco.
3. **Contornos:** _marching squares_ sobre os cantos das células, andando com o sólido à direita. Onde dois sólidos se tocam só pelo canto, a volta passa para o outro (vira à esquerda primeiro): a forma segue um polígono só, que pode tocar a si mesmo naquele ponto. Só os cantos entram, sem pontos colineares; por isso um quadrado dá 4 vértices exatos.
4. **Ilhas:** cai a que tem menos de 1% da área da grade (exato 1% fica); das que sobram, as 4 maiores.
5. **Redução:** Ramer-Douglas-Peucker em cada laço, partindo de tolerância 0,75 célula (acima dos 0,71 de uma escada a 45°, abaixo do dente de uma célula) e crescendo 25% até caber em 48 no total. Cada passada parte do resultado da anterior. Três âncoras nunca saem, então toda ilha continua polígono, por mais apertado que seja o orçamento.
6. **Saída:** arredondada em 4 casas.

Pior caso medido em grade 128 × 128 (pente, ruído): até 21 ms, com o `outlineOfAlpha` síncrono e o envio limitado a 20 por minuto.

## Leitura do alfa (`SharpImageProcessor`)

`NormalizeOptions.outline: true` → `NormalizedImage.outline`. O `outlineOfKept` relê a **saída** normalizada (recorte e rotação já valem; os bytes guardados não mudam): `ensureAlpha` (JPEG e WebP sem alfa dão o retângulo da imagem), `extractChannel('alpha')` (vale também para cinza com alfa e PNG de 16 bits), `resize` `inside` até `ALPHA_GRID_MAX_SIDE` (128) sem ampliar e com `kernel: 'linear'` (cobertura média, sem o anel do `lanczos3`), `raw`. Sem o pedido, `outline: null` e nada é lido. GIF animado (`keptAnimatedGif`) é sempre `null`, mesmo pedido: GIF só existe na `aura`, que não pede.

## Quem grava e quem lê

- `outlineFor(purpose)` (`asset-upload.bo.ts`): verdadeiro só em `token`. O `keptAs` do service só põe a chave `outline` quando há pedido, então `upload` e `importLink` de `token` pedem e as outras finalidades continuam com as mesmas opções de antes. Um asset de `background` usado como token não tem contorno: `null`, bloqueia pelo retângulo.
- `toNewAssetPo` grava `sightOutline: image.outline`; `toAssetOutlineDto(row)` → `{ outline }`.
- `AssetsService.outlineOf(userId, assetId) → AssetOutlineResponseDto`: mesma guarda do `open` (`readableRow`: linha, participação e `AssetReadPolicyPort` em `library_image`/`document_image`, tudo com o mesmo `ASSET_NOT_FOUND`). Não abre o objeto do S3.
- `AssetsDao.outlinesOf(campaignId, assetIds) → ReadonlyMap<assetId, AssetPo['sightOutline']>`: só as colunas `id` e `sight_outline`, filtrando pela mesa (id de outra mesa fica fora do mapa); lista vazia não consulta o banco. É o que a porta vista usa (Fase 6).

## Testes

- `server/test/infrastructure/image-processor/alpha-outline.spec.ts` (grade à mão): 4 cantos do quadrado, encaixe nos dois sentidos, "L", círculo em 48 com ±5% de área, pente, ilha fina que segue triângulo, dente de uma célula, limiar, ilhas (duas, 0,49% cai e 1% fica, 6 → 4 maiores), anel, mancha no anel, sólidos que se tocam pelo canto, grade inconsistente.
- `sharp-image-processor-outline.spec.ts` (`sharp` real; ficou à parte pelo teto de 500 linhas do spec do adaptador): PNG recortado, opaco 200 × 100, JPEG, WebP, cinza com alfa, 16 bits, transparente, alfa 127/128 no arquivo, círculo 800 × 800 pela grade reduzida, recorte `square`, bytes iguais com e sem o pedido, GIF, sem o pedido.
- `server/test/integration/asset-outlines.spec.ts` (Postgres e SeaweedFS): Bia envia e Caio lê com `Cache-Control` imutável, linha antiga e `aura` → `null`, transparente → `[]`, 401, id malformado, inexistente e de outra mesa → 404 `ASSET_NOT_FOUND`, imagem privada da biblioteca: 404 ao jogador e `null` ao mestre.
- `assets-dao.spec.ts` (`outlinesOf`: o `jsonb` volta igual, `[]` ≠ `null`, linha sem a coluna → `null`, outra mesa fora, sem ids), `asset-upload.bo.spec.ts` (`outlineFor`), `assets.mapper.spec.ts` e `assets.service.spec.ts` (bloco "the silhouette of a token image"). O `AssetsDaoFake` ganhou `outlinesOf`, e o `ImageProcessorFake.result`, `outline: null`.
