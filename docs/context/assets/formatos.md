# Assets — formatos (Foto, Capa, Banner) e recorte

Hub: [`../assets.md`](../assets.md). DTOs em [`../contracts/assets.md`](../contracts/assets.md); o uso da imagem na mesa em [`../campaigns.md`](../campaigns.md).

## As três imagens da mesa

| Finalidade        | Formato | Lado máximo       | Migração                                                           |
| ----------------- | ------- | ----------------- | ------------------------------------------------------------------ |
| `campaign_photo`  | 1:1     | 512 (512 × 512)   | `0105_campaign_image_purposes.sql` (só o `ALTER TYPE … ADD VALUE`) |
| `cover`           | 2:1     | 1600 (1600 × 800) | `0048_campaign_settings.sql`                                       |
| `campaign_banner` | 3:1     | 1800 (1800 × 600) | `0105_campaign_image_purposes.sql`                                 |

- A `0105` só acrescenta os dois valores ao enum `asset_purpose`; as colunas da mesa que os usam (`photo_asset_id`, `banner_asset_id`) vêm na `0106_campaign_photo_banner.sql`, porque o Postgres não deixa usar um valor novo de enum na mesma transação (o mesmo motivo da `0049`).
- As proporções vêm do `ASSET_FRAME` dos contracts; o service as passa ao BO (o BO não importa DTO).
- Toda `cover` enviada sai 2:1; uma capa gravada antes da `0105` pode ter outra proporção e a tela a corta pelo `object-cover`.
- Qualquer membro que envia imagem (mestre ou jogador) envia as três; quem pode **usar** uma como imagem da mesa é o `PATCH /campaigns/:id` (`photoAssetId`, `cover`, `bannerAssetId`; cada um só aceita a sua finalidade, ver `requireCampaignImage` em [`../campaigns.md`](../campaigns.md)). As duas colunas novas entram no `ASSET_FOREIGN_KEYS` da varredura ([`cota-e-varredura.md`](cota-e-varredura.md)) e, como a `cover_asset_id`, ficam sem índice (o asset só sai pela cascata da mesa ou solto).

## Rota

`POST /campaigns/:campaignId/assets?purpose=<finalidade>&cropX=…&cropY=…&cropW=…&cropH=…`

- O retângulo é opcional, em **percentual** (0..100) da imagem já em pé, os quatro juntos ou nenhum (o `uploadAssetQueryDto` recusa o incompleto, o negativo e o que passa de 100 → 400 `INVALID_BODY`).
- A borda converte os quatro campos em `ImageCrop { x, y, w, h }` por `toImageCrop(query)` (`assets.mapper.ts`; sem os campos → `null`) e chama `upload(userId, campaignId, { bytes, purpose, crop })` (`UploadedFile`).
- Retângulo numa finalidade sem formato (`token`, `background`, `condition`…) → `InvalidCropError` (`INVALID_BODY`, 400, mensagem pública "This image cannot be cropped"), antes de decodificar ou guardar.
- O link (`POST …/assets/import`) não leva retângulo: Foto, Capa e Banner por link são cortados no **centro** do formato.

## Regra (`asset-upload.bo.ts`)

- `resizeFor(purpose, limites)` → `{ maxSide }` (só o lado; o `pnpm db:recompress-images` o usa sem recortar de novo).
- `frameFor(purpose, crop | null, aspects)` → `ImageFrame | null`: a proporção da finalidade em `aspects` (o `ASSET_FRAME`) com o retângulo recebido (ou `null` = centro); a `condition` → 1:1 sem retângulo; as outras → `null` (ficam no formato delas). Retângulo onde não há proporção → `InvalidCropError` citando o retângulo, a finalidade e "expected campaign_photo, cover or campaign_banner".
- O `keptAs` do service junta `resizeFor` + `frameFor` + animação, contorno e WebP nas `NormalizeOptions`. A animação das três sai do `animationFor(…, ownerHasAnimatedArt)`: o plano que vale é o do **dono da mesa** (`ownerPlanOf` → `findOwnerPlan` → `effectiveLimitsOf(…).animatedCampaignArt`), não o de quem envia. Animar é exclusivo da Lenda (e do `amigo_do_dono`); Grátis, Apoiador e Narrador saem parados. São duas chaves: `campaignArt` (Narrador para cima) libera a Capa e o Banner **parados**; sem ela, Capa e Banner nem chegam a decodificar: `requireCampaignArtFor` recusa antes (e, no link, antes de baixar).

## GIF animado

- Dono com `animatedCampaignArt` (Lenda, `amigo_do_dono`): o GIF da Foto, Capa ou Banner fica **GIF animado** (o mesmo `keptAnimatedGif` da aura, mesmo orçamento `AURA_ANIMATION_LIMITS`: 120 quadros, 16 MP decodificados; GIF longo perde resolução em vez de quadros). Cada quadro é cortado pela mesma `frameBoxOf` (o `sharp` com `animated: true` aplica o `extract` a cada página) e depois reduzido ao lado da finalidade.
- Dono no Grátis, Apoiador ou Narrador: o 1º quadro, em PNG, nunca recusado (no Narrador vale também para a Capa e o Banner; no Grátis e no Apoiador esses dois já são recusados pelo `campaignArt`). Um link segue a mesma regra (cortado no centro).
- No client, o `animatesImage` (`lib/image-file.ts`) inclui as três: o seletor aceita GIF, e o recorte mostra o arquivo no `react-easy-crop` (um `<img>`); a imagem é desenhada por `<img>`, que anima sozinho.

## Caixa do recorte (`frame-box.ts`)

`frameBoxOf(size, aspect, crop | null) → PixelBox { left, top, width, height }` (pixels inteiros): o retângulo em % vira pixel pelo tamanho real (sem retângulo, a imagem inteira), e a maior caixa do `aspect` fica centrada nele; nunca sai da imagem e tem ao menos 1 px por lado (o arredondamento do client pode passar 1 px da borda). O tamanho é o **em pé**: o `metadata()` dá o de antes do `autoOrient`, então EXIF 5–8 troca largura e altura (`uprightSizeOf`). O `frame` vale nos dois caminhos: no animado o tamanho é o de um quadro (`pageHeight`) e um GIF não tem EXIF.

## Testes

- Unit: `asset-upload.bo.spec.ts` (`frameFor` de cada formato, com e sem retângulo, a `condition`, a recusa citando a finalidade), `assets.mapper.spec.ts` (`toImageCrop` com e sem os campos) e `assets.service.spec.ts` (a Foto com retângulo pede `{ 512, frame 1:1 com o retângulo }`, o link da Foto pede o centro, o retângulo num `token` → `INVALID_BODY` com o diário vazio).
- GIF: `asset-upload.bo.spec.ts` (`animationFor` das três com e sem `animatedCampaignArt`; Capa e Banner no Narrador passam o `requireCampaignArtFor` e saem parados; `aura` e `sheet_image` animam em todo plano; `requireCampaignArtFor`), `assets.service.spec.ts` (Foto de dono Grátis ou Apoiador → sem `animation`; Foto, Capa e Banner de dono Narrador → sem `animation`; Capa e Banner de dono Apoiador → `PLAN_LIMIT` antes de decodificar; link de Banner no Grátis → recusado sem baixar; dono Lenda com jogador Grátis enviando → com), `sharp-image-processor.spec.ts` (GIF 1:1 cortado no retângulo, 3 quadros; Capa 2:1 no centro animada).
- Integração `server/test/integration/campaign-image-upload.spec.ts` (Postgres e SeaweedFS reais): GIF de 3 quadros com dono Lenda → `image/gif` de 3 páginas cortado na metade pedida (Foto) e animado mesmo enviado por jogador Grátis (Capa, Banner); dono Narrador → Capa e Banner em PNG de 1 página; Foto com dono Grátis, Apoiador ou Narrador → PNG parado de 1 página; Capa e Banner com dono Grátis → 403 `campaignArt`; PNG 1200 × 600 vermelho | azul com a metade direita → 512 × 512 todo azul (lido de volta pelo `GET`), Banner 3600 × 1800 sem retângulo → 1800 × 600, Capa 1000 × 1000 → 1000 × 500, retângulo num `token` → 400, retângulo incompleto → 400, jogador envia Foto → 201, e o enum do banco tem as duas finalidades.

## Armadilhas

- **`extract` num GIF animado corta cada quadro.** Com `sharp(bytes, { animated: true })`, o `extract` e o `resize` valem por página (a caixa é em pixels de **um** quadro: `width` × `pageHeight`), não na tira inteira; o `metadata()` sem `animated` já dá a altura de um quadro. É por isso que Foto, Capa e Banner animados reusam a `frameBoxOf` da imagem parada.
