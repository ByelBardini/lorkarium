# Banner do perfil (Minha conta)

Linha da aba Perfil; o resto da tela em [`account.md`](account.md), as rotas em [`../profiles.md`](../profiles.md).

- `banner-field.tsx` — linha `group` "Banner" (depois de "Sobre você"), salva sozinha como a foto. Sem personalização (`customizationGate` do `AccountPlanContext`, Grátis): bloqueada com o `PlanSeal` do Apoiador, "Banner de perfil está nos planos pagos." (`featureRefusalText('profileBanner')`) e "Disponível no plano Apoiador", sem botões. Com plano: prévia 3:1 (`/api/banners/<id>` por `lib/banner-url.ts`, ou a cor) + `ImageSourceButtons`; o arquivo abre o `ImageCropDialog` 3:1 (`purpose="campaign_banner"`, `title` "Recortar o banner do perfil"), e "Enviar" manda o **próprio arquivo** com o retângulo (`useBannerUpload` → `send(file, rect)` → `profileApi.uploadBanner(file, rect)` → `PUT /api/account/banner?cropX&cropY&cropW&cropH`, por `appendCropTo` de `services/assets-api.ts`); o server corta cada quadro, então um GIF continua animado (nenhum canvas no client: ele congelaria o GIF); o link vai direto (`POST …/banner/link`, o server centraliza); "Tirar banner" pela intenção `banner-remove`. Prop `cropArea` para o spec (fake `fakeCropAreaReporting`). A descrição diz "GIF (animado)".

## Testes

`client/test/features/account/banner-field.spec.tsx` (Grátis bloqueado com o selo, recorte 3:1 e envio, Cancelar, banner guardado, recusa `PLAN_LIMIT`), `account-route.spec.tsx` ("preferências": contador, `PATCH`, prévia com o banner e "Tirar banner"), `test/lib/banner-url.spec.ts`, `test/services/profile-api.spec.ts` (banner, com o retângulo na query).
