# Assets · imagens do chat

Índice: [`../assets.md`](../assets.md) · o chat: [`../chat.md`](../chat.md) · cota e varredura: [`cota-e-varredura.md`](cota-e-varredura.md).

Finalidade `chat_image` (`0126_chat_image_purpose.sql`, `ALTER TYPE … ADD VALUE`): a imagem anexada a uma mensagem do chat da mesa. É um **asset solto por desenho**: nenhuma tabela a referencia (fora de `ASSET_FOREIGN_KEYS`), então a varredura a apaga em ~24–25 h e, enquanto vive, ela conta na cota do dono da mesa.

## Envio

- Pelas rotas genéricas: `POST /campaigns/:c/assets?purpose=chat_image` (arquivo) e `POST /campaigns/:c/assets/import` `{ url, purpose: 'chat_image' }` (o Ctrl+I do composer, pelo `GuardedImageFetcher`). Sem rota própria: não há associação a gravar.
- PNG, JPEG, WebP e GIF; o GIF fica **animado** em qualquer plano (`ANIMATED_PURPOSES`, orçamento do `AURA_ANIMATION_LIMITS`). Até **10 MiB** (`CHAT_IMAGE_MAX_BYTES` no `BYTE_LIMITS` do service, lido pelo `maxBytesFor(purpose, limits)`, no arquivo e no link; as outras finalidades seguem com 20 MiB) e 2048 px de lado. Sem recorte.
- **Todo membro envia, espectador incluso** (`isSpectatorAssetPurpose`: o `senderAccessOf` do service usa o `viewerAccessOf` só para ela). Quem é de fora da mesa: 404 `CAMPAIGN_NOT_FOUND`.

## Leitura

- Protegida (`isProtectedAssetPurpose`): `private, no-cache` com ETag, e não vira token, fundo, forma, aura, condição nem capa (`ASSET_NOT_FOUND`).
- O ramo `chat_image` da `readPolicy` do `buildApp` devolve `true`: a leitura já conferiu a participação, então **qualquer membro da mesa** lê pelo id (a imagem de um sussurro também, para quem tiver o id, que só viaja no `chat:sent` do público). Membro de outra mesa: `ASSET_NOT_FOUND`.

## Testes

Unit em `asset-upload.bo.spec.ts` (lado 2048, animada, protegida, sem rota própria, não é só do mestre, espectador envia, `maxBytesFor`); integração `chat-images.spec.ts` (PNG reduzido e lido sem cache, GIF animado, espectador, link pelo `ImageFetcherFake` injetado no `buildApp` como `imageFetcher`, link que não responde, 10 MiB no arquivo e no link, SVG 415, cota cheia, isolamento entre mesas, não vira token nem fundo) e o caso `chat_image` de 25 h × 23 h em `asset-sweep.spec.ts`.
