# Client — testes

Índice: [`../client.md`](../client.md). Guia geral dos testes: skill `/testar`.

- Vitest do projeto `@lorkarium/client` em `jsdom` (`client/vite.config.ts`, bloco `test`); specs em `client/test/` espelhando `src/` e importando por `@/...`.
- `client/test/setup.ts` carrega o jest-dom e faz `cleanup` depois de cada `it` (sem globals do Vitest, o Testing Library não se limpa sozinho).
- `client/test/jest-dom.d.ts` tipa os matchers do jest-dom no `Matchers<R, T>` do Vitest 5.
- `client/test/support/app-dependencies.ts` — `testDependencies()`: todo o `AppDependencies` em fakes (cada store do navegador sobre o próprio `StorageFake`, exposto como `<store>Storage`) (o `openTables` real sobre o `TableSessionApiFake` e um `StorageFake`, expostos como `tableSessionApi` e `tabStorage`), `interactionClock` = `InteractionClockFake` (o relógio da sala movido à mão), `now` fixo (`TEST_NOW`, quarta 14/10/2026), `random` = 0 ("E aí, {nome}.") `waitBeforeRetry` = `retryWaits` (`RetryWaitFake`) e `publishedBuild`/`pageReloads` ([`client/app-update.md`](app-update.md)).
- `ProfileApiFake` e `AccountSecurityApiFake` (no `testDependencies()`): ver [`client/account.md`](account.md).
- `client/test/support/http-transport-fake.ts` — `HttpTransportFake` (`respondWith(status, body, headers)`, `failWithNetworkDown()`, `requests`).
- `client/test/support/campaigns-api-fake.ts` — `CampaignsApiFake` (`answer(método, resultado)`, `hold(método)`, `callsOf(método)`), mesas `VHARN` (mestre, entrou por último) e `QUELM` (jogador, pública, Tormenta20) e `detailOf(resumo, overrides)`; status, capa, avisos e tags das fixtures em [`client/campaign-parts.md`](campaign-parts.md).
- `client/test/support/realtime-transport-fake.ts` — `RealtimeTransportFake` (`sent`, `connects`, `disconnects`; `answerAck(resposta)` / `timeOutAck()` resolvem o ack mais antigo; `serverEmits(evento, payload)`; `lifecycle(mudança)`; `isConnected()` segue a última mudança). `table-session-fixtures.ts` — membros `ANA_AT_TABLE`, `BIA_AT_TABLE` (offline), `CAIO_AT_TABLE`, `vharnState(overrides)`, `biaJoined()`, `biaLeft()`.
- `client/test/support/table-session-api-fake.ts` — `TableSessionApiFake` (`opened`, `closedIds` e `closed` = quantos, `emit(...updates)` ao último listener e `emitTo(campaignId, ...updates)` ao da mesa, dentro de `act`); está no `testDependencies()`.
- `client/test/support/call-journal.ts` — `CallJournal` (`entries`): o `AuthApiFake` escreve `logout` e o `TableSessionApiFake` `close:<id>`; no `testDependencies()` os dois dividem o mesmo (`deps.journal`).
- `client/test/support/clipboard-fake.ts` (`ClipboardFake`, `copied`, `pasteText`), `field-editing-fake.ts` (`FieldEditingFake`) e `storage-fake.ts` (`StorageFake`, `values`, `removeItem`; `new StorageFake(true)` lança como storage bloqueado).
- Tela com `loader`/`action` se prova pelo router inteiro (`createMemoryRouter(buildRoutes(testDependencies()))`); os subcomponentes de diálogo e da home não têm spec próprio, são provados pelo spec do pai.
- Componente se prova pelo que o usuário vê: `getByRole`/`getByLabelText` + `toHaveTextContent`/`toBeDisabled`/`toHaveAttribute`, não classe CSS.
