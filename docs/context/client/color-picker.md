# Client · seletor de cor personalizada

Hub: [`../client.md`](../client.md). Server e rotas: [`../saved-colors.md`](../saved-colors.md).

Ao lado das cores fixas, um ladrilho abre um popover com área de cor, campo de código e a lista de cores salvas da conta. Uma cor personalizada é sempre `HexColorDto` (`#rrggbb` minúsculo).

## Peças

| Arquivo                                                 | Papel                                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/components/color-picker/hex-color-canvas.tsx`      | `HexColorCanvas`: área + matiz; **o único import do `react-colorful`**                   |
| `src/components/color-picker/custom-color-panel.tsx`    | `CustomColorPanel`: o conteúdo inteiro, usável em qualquer popover                       |
| `src/components/color-picker/saved-color-grid.tsx`      | `SavedColorGrid`: círculos, 6 por fileira; clique usa, "x" tira da lista                 |
| `src/components/color-picker/custom-color-tile.tsx`     | `CustomColorTile`: o ladrilho redondo + o popover                                        |
| `src/components/color-picker/saved-colors-context.tsx`  | `SavedColorsProvider({ api, userId })`, montado no `ShellRoute` (`app/router.tsx`)       |
| `src/components/color-picker/use-saved-colors-store.ts` | `SavedColorsContext` e `useSavedColorsStore()`                                           |
| `src/features/drawings/palette-color-field.tsx`         | `PaletteColorField`: `StyleTileGroup` redondo com o ladrilho no slot `trailing`          |
| `src/lib/custom-color.ts`                               | `colorNumberOf('#336699')` → `0x336699`; `hexFromTyped('#ABC')` → `'#aabbcc'`, ou `null` |
| `src/lib/color-contrast.ts`                             | `contrastRatioOf(a, b)` (WCAG); `legibleInkOn(fundo)` → `#ffffff` ou `#1a1a1a`           |
| `src/services/saved-colors-api.ts`                      | `SavedColorsApi` / `HttpSavedColorsApi`; `AppDependencies.savedColorsApi`                |
| `src/stores/saved-colors-store.ts`                      | `createSavedColorsStore(api)`, `useSavedColors(store, seletor)`                          |

## API dos componentes

- `CustomColorTile`: `value: string | null | undefined` (hex marca o ladrilho; nome de paleta ou vazio deixa o "+"), `onPick: (cor: HexColorDto) => void`, `disabled?`, `legibleOn?: HexColorDto`, `className?` (outro tamanho que não `size-7`).
- `CustomColorPanel`: `value: string | null | undefined` (onde a prévia começa; sem hex, o dourado), `onPick`, `legibleOn?`. Chama `onPick` e **não fecha nada**: quem fecha é o dono do popover. A prévia vive no estado dele e morre ao desmontar: é isso que faz Esc e clique fora descartarem.
- `PaletteColorField<T>`: `legend`, `value: T | HexColorDto | null`, `tiles: readonly StyleTile<T>[]`, `onChange: (valor: T | HexColorDto) => void`, `disabled?` (o campo todo), `customDisabled?` (só o ladrilho), `hint?`, `legendHidden?`, `legibleOn?`.
- `StyleTileGroup`: `trailing?: ReactNode`, no fim da fileira e dentro do `radiogroup`, sem ser `Item`.

## Regras

- O arrasto e as setas no canvas só mudam a prévia. `onPick` sai uma vez, por "Usar cor" ou pelo clique numa salva. "Salvar" e excluir só mexem na lista.
- O ladrilho é `button` depois dos `Item`: as setas andam só entre as cores fixas e não abrem o popover. Com hex: mostra a cor, anel dourado, nome "Cor personalizada: #336699"; nenhum `Item` marcado.
- Campo de código: com ou sem `#`, qualquer caixa, forma curta. Inválido: `aria-invalid`, erro em `aria-describedby`, "Usar cor" e "Salvar" desligados; o canvas fica na última válida.
- "Salvar" desliga com a cor já salva e com a lista cheia (`SAVED_COLORS_MAX`, mensagem pedindo para excluir uma). Se a lista estava velha, o 409 mostra a mesma mensagem em `role="alert"`.
- `legibleOn`: abaixo de 4,5:1 mostra aviso, sem bloquear.
- Excluir leva o foco para a grade antes de o botão sumir: foco caindo na página fecharia o popover.
- O popover tem 288 px (`w-72`), no ladrilho e na barra de documento; quem monta o `CustomColorPanel` em outro popover usa a mesma largura.
- O marcador do canvas leva um contorno escuro de 1 px por `box-shadow`: não é elevação, é o que o mantém visível no lado claro da área.

## Lista da conta

- Mais recente primeiro. O painel chama `load` ao montar, isto é, a cada abertura, mostrando a última conhecida enquanto chega. POST e DELETE devolvem a lista inteira, e o store troca a dele pela resposta, sem otimismo.
- Corrida: de dois comandos, só a resposta do mais novo vale; de dois `load`, idem; e um `load` perguntado antes de um comando é descartado, porque pode ter lido a lista anterior a ele.
- Falha (`problem`, por `SavedColorsFailure`: `saved_colors_limit`, `rate_limited`, `offline`, `unauthenticated`, `invalid`, `unexpected`) mantém a lista; o próximo sucesso limpa.
- `SavedColorsProvider` cria outro store quando o `userId` muda, por estado (`useMemo` pode ser descartado pelo React e perderia a lista), para a troca de conta não mostrar a lista anterior.
- Fora de um provider, `useSavedColorsStore` devolve um store inerte: lista sempre vazia, comandos sem efeito. O painel abre; é o caso dos specs de componente que não testam a lista.
- Sem evento em tempo real: é dado pessoal e não afeta a mesa.

## Testes

- `pickCustomColor(ladrilho, hex)` e `applyTypedCustomColor(hex)` em `client/test/support/pick-custom-color.ts`: abrem o painel, digitam o código e apertam "Usar cor".
- `SavedColorsApiFake` e `fullSavedColors()` em `client/test/support/saved-colors-api-fake.ts`; o fake guarda a lista como o server (`colors`) e aceita `answers.answer`/`hold`. Está no `testDependencies()` como `savedColorsApi`.

## Armadilhas

- **Seta no canvas em spec é `fireEvent.keyDown(controle, { key: 'ArrowRight', keyCode: 39 })`.** O `react-colorful` lê `which`/`keyCode`, que o `user.keyboard('{ArrowRight}')` deixa em 0: nada acontece e o teste parece provar que a seta não funciona.
- **O CSS do `react-colorful` é injetado sem camada e vence os utilitários do Tailwind** (que moram em `@layer`). Por isso as classes de `CANVAS_LOOK` usam `!`. Elas também evitam o nome `react-colorful__x`: em variante arbitrária o `_` vira espaço, e o escape num texto JS (`\\_`) não gera classe nenhuma. Os seletores são por posição (`>:first-child`) e por pedaço de nome (`[class*=-pointer]`); confira no CSS do build. A lib também põe uma borda preta de 12 px embaixo da área de cor, que grudava na barra de matiz: `border-b-0!` a tira.
- **Os nomes acessíveis da lib são fixos em inglês** ("Color", "Hue"), sem prop: o `HexColorCanvas` os reescreve no DOM a cada cor. O `aria-valuetext` da área passa a ser o próprio hex.
