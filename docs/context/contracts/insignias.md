# Contratos: insígnias (`src/badges/`)

Spec em `packages/contracts/test/badges/badge.dto.spec.ts`. Regra e rotas em [`../badges.md`](../badges.md).

- Limites: `BADGE_NAME_MAX_LENGTH` (40), `BADGE_DESCRIPTION_MAX_LENGTH` (200), `BADGE_IMAGE_SIDE` (128: WebP estático 1:1 com transparência), `BADGE_IMAGE_MAX_BYTES` (2 MiB, antes de decodificar).
- `badgeNameDto` / `badgeDescriptionDto` — aparados, de 1 ao limite; a mensagem cita o valor e "expected 1 to N characters". Nome único sem diferença de maiúscula (quem garante é o índice do server).
- `badgeDto` `{ id, name, description, imageId (uuid, nunca nulo) }` — a insígnia fora do backoffice: só a que tem imagem sai no card (`profileCardDto.badges`) e no perfil próprio (`profileDto.badges`).
- `adminBadgeDto` — o `badgeDto` com `imageId` nulo permitido + `position` (inteiro ≥ 0) + `holders` (quantas contas têm).
- Corpos (estritos): `createBadgeRequestDto` `{ name, description }` (sem `position`: a nova vai para o fim); `updateBadgeRequestDto` `{ name?, description? }` (ao menos um); `badgeOrderRequestDto` e `userBadgesRequestDto` `{ badgeIds }` — uuids sem repetir (a mensagem cita o id repetido), até 500; `[]` na concessão tira todas.
- Params e query: `badgeParamsDto` `{ badgeId }`, `badgeImageParamsDto` `{ imageId }`, `badgeImageUploadQueryDto` (= `imageCropQueryDto`: o retângulo 1:1 em percentual).
- Respostas: `adminBadgesResponseDto` `{ badges: AdminBadgeDto[] }` (catálogo e ordem), `adminBadgeResponseDto` `{ badge }`, `userBadgesResponseDto` `{ badges: BadgeDto[] }` (concessão), `userBadgeIdsResponseDto` `{ badgeIds }` (o que a conta tem, com ou sem imagem).
