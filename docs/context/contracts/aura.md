# Contracts — aura do token

Índice: [`../contracts.md`](../contracts.md). Fluxo e telas: [`../tokens/aura.md`](../tokens/aura.md), [`../client/auras.md`](../client/auras.md).

`src/board/token-aura.dto.ts`:

- `AURA_EFFECTS` — `fire`, `water`, `lightning`, `frost`, `radiant`, `shadow`, `poison`, `arcane`, nesta ordem (a do seletor). `auraEffectDto` é o enum; o shader e a cor natural moram só no client.
- `AURA_RADIUS_MAX` (20), `AURA_OPACITY_MIN` (10), `AURA_OPACITY_MAX` (100) — repetidos do `aura.vo.ts` do game-core (o contracts só depende do zod).
- `tokenAuraDto` — `z.discriminatedUnion('kind')` de três objetos estritos, todos com `radius` (casas além da borda, 0 a 20, decimal) e `opacity` (inteiro 10 a 100):
  - `color` — `color: drawingColorDto` (obrigatória; a paleta dos desenhos, 8 tons);
  - `effect` — `effect: auraEffectDto` e `color: drawingColorDto | null` (`null` = cor natural do efeito);
  - `image` — `imageAssetId: uuid` (asset da mesa, finalidade `aura`; o server confere com o `requireAssetsOf`) e `shape: auraImageShapeDto.default('square')` (`AURA_IMAGE_SHAPES` = `square` | `round`: inteira na caixa ou cobrindo um círculo; ausente = `square`, então o client antigo segue válido e a saída sempre traz a forma).
    Campo de outro `kind` (efeito com `imageAssetId`) é recusado pelo objeto estrito.

Onde a aura entra:

- `tokenDto.aura` — `tokenAuraDto | null`; igual para todo público (sem redação).
- `createTokenCommandDto.aura` — `nullable().default(null)`; `updateTokenCommandDto.aura` — `nullable().optional()` (ausente mantém, `null` tira).
- `tokenStyleDto.aura` (`token:restyleMany` / `token:restyledMany`) — `nullable().optional()`; o estilo vazio cita a aura na mensagem ("style is empty; expected at least one of imageAssetId, frame, flipX, flipY, defeated, lightLit, aura").

Assets (`src/assets/asset.dto.ts`): finalidade `aura` (`ASSET_MAX_SIDE.aura` = 512), `image/gif` no `ASSET_MIME_TYPES` (guardado só para a aura) e `AURA_ANIMATION_LIMITS` = `{ maxFrames: 120, maxDecodedPixels: 16_000_000 }`.

Specs: `test/board/token-appearance.dto.spec.ts` ("tokenStyleDto, aura": inclusive imagem sem forma → `square`, `round`, forma `oval` recusada em `aura.shape`, cor com forma recusada).
