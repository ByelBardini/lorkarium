# Client · Backoffice · Insígnias

Hub: [`backoffice.md`](backoffice.md). O catálogo de insígnias (`/admin/badges`) e a concessão pelo menu de cada conta em Usuários. Contratos: [`../contracts/insignias.md`](../contracts/insignias.md).

## Serviço (`services/badges-admin-api.ts`)

- `BadgesAdminApi` / `HttpBadgesAdminApi` (dep `badgesAdminApi` do `AppDependencies`, montada em `main.tsx`): `catalog` (`GET /admin/badges`), `create` (`POST`, corpo pelo `createBadgeRequestDto`), `update` (`PATCH /admin/badges/:id`, `updateBadgeRequestDto`), `uploadImage(badgeId, file, crop)` (`PUT /admin/badges/:id/image`, bytes crus + `cropX/cropY/cropW/cropH` pelo `appendCropTo` de `assets-api.ts`), `reorder(badgeIds)` (`PUT /admin/badges/order`), `remove` (`DELETE`, 204 → `null`), `grantsOf(userId)` (`GET /admin/users/:id/badges` → ids), `grant(userId, badgeIds)` (`PUT`, devolve os `BadgeDto` da conta). Toda resposta passa pelo DTO; fora dele é `unexpected`.
- Falhas `BadgesAdminFailure` = `UserAdminFailure` + `BadgeCatalogFailure`: `name_taken` (`BADGE_NAME_TAKEN`), `order_stale`, `badge_without_image`, `image_too_large` (`BADGE_IMAGE_TOO_LARGE` ou qualquer 413 — o Fastify corta antes da rota), `unsupported_image` (`UNSUPPORTED_IMAGE` ou qualquer 415); `BADGE_NOT_FOUND` e `USER_NOT_FOUND` → `not_found`; o resto pelo `userAdminFailureOf`.
- Fake: `test/support/badges-admin-api-fake.ts` — `BadgesAdminApiFake` guarda o catálogo em ordem (`badges`) e as concessões (`grants`), registra cada envio em `uploads` (`{ badgeId, file, crop }`), roteirizável por `answers`; fixtures `VETERAN_BADGE` (12 contas), `NARRATOR_BADGE` (1), `FOUNDER_BADGE` (sem imagem).

## Rota (`badgesRoute` em `admin-routes.tsx`, `lazy`)

- `loader` = `catalog()` (recusas pelo mesmo `refusedLoad` dos usuários: login, "Sem acesso" ou `ApiLoadError`); `action` = `badges-action.ts` (JSON `{ intent }`: `create`, `update` (`{ badgeId, name, description }`), `order` (`{ badgeIds }`), `delete`; sessão caída e papel perdido vão ao `ErrorBoundary` pelo `refuseSession`); `ErrorBoundary` = `AdminErrorScreen` com "Lorkarium · Insígnias" e "Não deu para carregar as insígnias.".
- A imagem **não** passa pela action (um `File` não viaja em JSON): `badge-image.tsx` `useBadgeImageSend(api)` chama `uploadImage` direto e recarrega o catálogo com `useRevalidator` — se a sessão caiu ou o papel saiu, é o loader que recusa e leva ao login ou a "Sem acesso".
- `use-badges-fetcher.ts`: `useBadgesFetcher` (`busy`, `settled` só depois da recarga, `send` para `/admin/badges`), `useOnBadgesSettled`, `badgesFailureOf`.

## Página (`badges-page.tsx`)

- "Insígnias" + "O que você concede às contas pelo menu de Usuários. O card mostra nesta ordem." + **Nova insígnia**. `<title>Lorkarium · Insígnias</title>`. Linha `role="status"` com o último feito: "“Raro” criada.", "“Veterana” salva.", "Imagem de “Veterano” enviada.", "“Veterano” excluída.". Recusa da ordem ou da imagem da linha num `Alert` acima da lista.
- `badges-table.tsx` (`caption` "Insígnias"): Imagem (`badgeImageUrlOf`, `alt` = nome; sem imagem → "Sem imagem" + botão "Enviar imagem"), Nome, Descrição, Contas ("1 conta", "12 contas"), as setas "Subir <nome>"/"Descer <nome>" (a primeira linha não sobe, a última não desce; esperam enquanto uma ordem vai) e `badge-row-menu.tsx` ("Ações de <nome>": Editar · Trocar imagem | Enviar imagem · Excluir insígnia). Vazio: "Nenhuma insígnia ainda.".
- Ordem: a lista inteira com a troca de vizinhos; `order_stale` → a recarga já trouxe o catálogo novo e o `Alert` diz "A lista de insígnias mudou no meio. Ela foi recarregada; ordene de novo.".
- `badge-sheet.tsx` (gaveta): "Nova insígnia" (Nome, Descrição, Imagem) ou "Editar insígnia" (só os textos, preenchidos). Validação local antes de qualquer pedido: "Informe o nome da insígnia.", "O nome passa de 40 caracteres.", "Informe a descrição da insígnia.", "A descrição passa de 200 caracteres."; `name_taken` → "Já existe uma insígnia com esse nome." sob "Nome" (`aria-invalid`). "Criar" manda os textos e, com a insígnia criada, a imagem com o retângulo; imagem recusada depois disso → "A insígnia foi criada, mas a imagem não foi. <motivo> Envie outra pela linha dela." + "Voltar à lista" (a linha fica "Sem imagem").
- Imagem (`badge-image.tsx` `useBadgeImagePick`): `input` oculto "Arquivo de imagem" (PNG, JPEG, WebP, GIF), checagem local `badgeImageProblem` (tipo; acima de `BADGE_IMAGE_MAX_BYTES` → "A imagem passa de 2 MB."), recorte 1:1 no `ImageCropDialog` (`purpose="campaign_photo"`, título "Recortar a insígnia"); a prévia da gaveta mostra o quadrado recortado escalando a imagem inteira (o server é quem corta). A página usa o mesmo `input` para "Trocar imagem"/"Enviar imagem" da linha, que manda só a imagem.
- Excluir: `delete-badge-dialog.tsx` sobre o `ConfirmDialogFrame` — "Excluir 'Veterano'?" + `badgeDeletionConsequence` ("12 contas perdem essa insígnia.", "1 conta perde…", "Nenhuma conta tem essa insígnia.") + "Excluir" ("Excluindo…"); a linha só some depois.

## Concessão (`user-badges-dialog.tsx`)

- "Insígnias…" no `UserRowMenu` (antes de "Excluir usuário"); a própria linha do admin também tem menu, só com "Insígnias…" (conceder a si mesmo vale). `users-dialog.tsx` abre `UserBadgesDialog` (prop `badgesApi` vinda de `usersRoute`).
- "Insígnias de @biaflor" + "Marque as que a conta tem. O card mostra na ordem do catálogo.": lê `catalog()` e `grantsOf(id)` juntos; uma caixa por insígnia (imagem + nome), as da conta marcadas; sem imagem → desabilitada com "Sem imagem". "Salvar" só com mudança ("Salvando…"), manda o conjunto (`[]` tira todas) e fecha com "Insígnias de @biaflor salvas." na linha de status da página.
- Catálogo vazio → "Crie uma insígnia em Insígnias primeiro." (link para `/admin/badges`), sem caixas nem "Salvar". Falha ao carregar → "Não deu para carregar as insígnias." + "Tentar de novo". `badge_without_image`/`not_found` ao salvar → "O catálogo mudou enquanto você marcava. As insígnias foram recarregadas; confira e salve de novo." e relê. Sessão caída ou papel perdido → recarrega a rota (o loader de Usuários recusa).

## Testes

- `test/services/badges-admin-api.spec.ts`; pelo router: `test/features/admin/badges-route.spec.tsx` (nav, lista, ordem, criar/editar sem imagem, validação, excluir, falhas de carga) e `user-badges-dialog.spec.tsx` (+ o item no `user-row-actions.spec.tsx`). `badge-sheet.spec.tsx` monta a rota com `badgesRoute(deps)` e um `Component` que passa `fakeCropAreaReporting` ao `BadgesPage` (jsdom nunca mede o `react-easy-crop`): criar com imagem, 2 MB, imagem recusada, trocar/enviar pela linha.

## Armadilhas

- Com um `alertdialog` aberto o resto da página sai da árvore de acessibilidade: no spec, `getByRole('table', { name, hidden: true })` para conferir a linha por trás.
- O `Sheet` já tem o "Fechar" (o X) acessível: um botão próprio com o mesmo nome quebra o `getByRole`.
