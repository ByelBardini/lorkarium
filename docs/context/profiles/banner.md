# Perfil — banner (recorte e GIF)

Hub: [`../profiles.md`](../profiles.md). Client em [`../client/account-banner.md`](../client/account-banner.md).

## Regra

- `PUT /api/account/banner?cropX&cropY&cropW&cropH`: o corpo é o próprio arquivo; a query é o `bannerUploadQueryDto` (= `imageCropQueryDto`, o retângulo 3:1 do diálogo em % da imagem em pé, os 4 ou nenhum). Inválida → 400 `INVALID_BODY`. A borda (`bannerEdgeOf` em `profile-images.routes.ts`) converte por `toImageCrop` (`assets.mapper.ts`) e chama `replaceBanner(userId, bytes, crop)`; o `ProfileImageEdge.replace` recebe o `request` para isso (a foto e a textura o ignoram).
- O link (`POST …/banner/link`) não leva retângulo: o centro.
- Trocar ou tirar avisa as mesas ao vivo (`tellsTables: true` → `session:memberUpdated`); o membro da sessão leva o `bannerId` só com `customizationAllowed` (`sessions.mapper.ts`, como o card).
- O `ImageShape` aceita `crop?: ImageCrop | null` (o tipo da porta de assets). O `SharpAvatarProcessor` corta a caixa do formato dentro do retângulo (`frameBoxOf` de `infrastructure/image-processor/`, sobre o tamanho de um quadro, em pé) antes do `resize` cover; numa animação o `extract` vale por quadro. Sem `crop`, o centro.
- O espaço do banner é `animated: customizationAllowed(account)`; como o `requirePlan` já recusa o Grátis, todo banner enviado guarda o GIF como **WebP animado** (o formato da foto), no orçamento do processador (120 quadros, 100 MP × quadros).

## Testes

- Unit: `profiles.service.spec.ts` (diário `normalize → put → swapBanner → remove`, forma `{ 1800 × 600, animado, crop }`, retângulo repassado, link sem `crop`, Grátis recusado antes de qualquer leitura, 413, tirar idempotente, id de foto → 404); `sharp-avatar-processor.spec.ts` (PNG 800 × 400 → WebP 1800 × 600; GIF parado na forma parada; retângulo cortado dentro dele; GIF de 3 quadros → WebP animado 1800 × 600); `contracts/test/account/banner.dto.spec.ts`.
- Integração `profiles.spec.ts`: GIF com retângulo → WebP de 3 páginas, retângulo incompleto → 400 sem banner, outra conta lê, trocar → 404 e objeto sumido, tirar, 403 no Grátis, 413, 415, link bloqueado, 11º envio → 429 com contador próprio; `profiles-dao.spec.ts`.
