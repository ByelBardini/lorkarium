# Movimento livre: o passo fino da posição

- **Passo:** a origem do token (`col`, `row`) anda de 1/64 em 1/64 de casa (`POSITION_STEP` no game-core, 1 px do mundo a 100%). É fração binária exata: em `double precision`, o `col * 64 = floor(col * 64)` do `CHECK tokens_box_steps` nunca erra por arredondamento, o que aconteceria com centésimos. Toda posição gravada antes da `0094_free_movement` era múltipla de 0,5, logo já cumpre o `CHECK`. Os lados continuam de meia em meia casa.
- **O modo não é conferido no server.** `scenes.free_movement` ([`../board.md`](../board.md)) só muda o gesto do client. `token:move`, `token:moveMany` e `token:dragMany` aceitam o passo fino em todo grid: um token deixado fora da casa ao desligar o modo precisa continuar movível em grupo e desfazível (`expect`), e a posição fina não dá vantagem de regra, porque permissão, cena e paredes seguem no server.
- **Desligar não escreve em lote:** os tokens ficam onde estão e voltam a encaixar quando movidos.
- **Testes:** `server/test/integration/free-movement.spec.ts` e `free-movement-migration.spec.ts`.
