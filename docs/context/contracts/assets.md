# Contracts — Assets (`assets/`)

`asset.dto.ts` — a imagem da mesa (fluxo, rotas e tratamento em [`../assets.md`](../assets.md)).

## Tipo, tamanho e link

- `ASSET_MAX_BYTES` (20 MiB, antes de decodificar), `ASSET_MIME_TYPES` (`image/png`, `image/jpeg`, `image/webp`, `image/gif`; o GIF só é guardado na finalidade `aura`, SVG fora) e `assetMimeTypeDto`; `ASSET_URL_MAX_LENGTH` (2048).
- `AURA_ANIMATION_LIMITS` `{ maxFrames: 120, maxDecodedPixels: 16_000_000 }` — o orçamento do GIF da aura (o server reduz o lado para caber, ver `assets.md`).
- `assetLinkDto` — link de imagem aparado, até 2048 caracteres, só `http:`/`https:` (`ftp:`, `data:`, `javascript:` recusados citando o esquema e "http or https"; texto que não é link, citando o texto). Sem o global `URL` (o `lib` do contracts é só ES2023): o esquema sai por regex. Usado pelas imagens da mesa e pela foto do perfil.

## Finalidade (`purpose`)

- `assetPurposeDto`: `background` | `token` | `cover` | `campaign_photo` | `campaign_banner` | `condition` | `aura` | `library_image` | `library_map` | `document_image` | `sheet_image` | `sheet_template_asset`.
- `ASSET_MAX_SIDE` — o maior lado em px que o server guarda: `background`, `library_image`, `document_image`, `sheet_image` e `sheet_template_asset` 4096; `library_map` 8192 (feito para dar zoom, desenhado como imagem, não textura); `token` 1024; `cover` 1600 (1600 × 800); `campaign_photo` 512 (quadrado de 256 px em tela 2x); `campaign_banner` 1800 (1800 × 600); `condition` 256 (o badge chega a ~120 px na tela, 240 em tela 2x); `aura` 512. Nenhum amplia a imagem.
- O `purpose` decide o tamanho e o recorte (na `condition`, que o server recorta em quadrado; na `aura`, que o GIF fica animado): um asset de token pode virar fundo; `library_image` e `library_map` são reservados à biblioteca e sua autorização de leitura depende do item/apresentação; `document_image` e `sheet_image` só entram pela rota do documento e da ficha.
- As três imagens da mesa: **Foto** (`campaign_photo`), **Capa** (`cover`) e **Banner** (`campaign_banner`). `FramedAssetPurposeDto` é a união das três e `ASSET_FRAME` a proporção de cada uma, `{ campaign_photo: 1:1, cover: 2:1, campaign_banner: 3:1 }` como `AssetFrameAspect` `{ width, height }` (congelado). O server guarda a imagem já nessa proporção, e nenhuma tela corta de novo.

## Envio e leitura

- `uploadAssetQueryDto` `{ purpose, cropX?, cropY?, cropW?, cropH? }` — query de `POST /api/campaigns/:campaignId/assets` (o corpo é o próprio arquivo). O retângulo do recorte é em **percentual** (0..100) da imagem já em pé (depois da orientação do EXIF), convertido de texto por `z.coerce.number()`:
  - `cropX`/`cropY` de 0 a 100; `cropW`/`cropH` maiores que 0 e até 100;
  - os quatro juntos ou nenhum: só parte deles é recusado citando os recebidos e "cropX, cropY, cropW and cropH together, or none";
  - `cropX + cropW` e `cropY + cropH` até 100 (folga de 1e-6 para o arredondamento do `react-easy-crop`); passar disso é recusado no caminho `cropW`/`cropH`, citando a soma. A soma só é conferida quando cada campo já passou sozinho (um erro, no caminho do campo).
  - Retângulo numa finalidade sem formato é recusado pelo server, não pelo DTO.
- `importAssetRequestDto` `{ url (assetLinkDto), purpose }` — corpo do `POST …/assets/import`. O link não leva retângulo.
- `assetDto` `{ id, mimeType, width, height }` (o tamanho **depois** de normalizado) e `assetResponseDto` `{ asset }` — resposta dos dois `POST`.
- `assetIdParamsDto` `{ assetId: uuid }` — params de `GET /api/assets/:assetId` e de `GET /api/assets/:assetId/outline`.

## Contorno

- `sightOutlineDto` / `SightOutlineDto` — a silhueta de uma imagem de token: até 4 polígonos, cada um com ao menos 3 pontos `[x, y]` de 0 a 1, 48 vértices no total (acima disso, a mensagem cita a conta e o limite). Repete os limites de `sight-outline.vo.ts` do game-core, porque o contracts só depende do `zod`; `[]` = toda transparente. Tudo `readonly`, também na saída do `parse` (congelada), para casar com o tipo do PO e do VO.
- `assetOutlineResponseDto` / `AssetOutlineResponseDto` `{ outline: SightOutlineDto | null }` — resposta do `GET …/outline` (`null` = sem contorno; ver [`../assets/contorno.md`](../assets/contorno.md)).
