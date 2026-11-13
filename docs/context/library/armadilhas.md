# Library · armadilhas

Hub: [`../library.md`](../library.md).

- **Postgres de teste compartilhado.** Dois agentes (ou terminais) rodando a integração ao mesmo tempo no mesmo `DATABASE_URL` se atropelam no `truncateAllTables` (falhas soltas de "no row", `ZodError` no `createTable`). Para rodar em paralelo, crie um banco próprio no mesmo container (`CREATE DATABASE …`) e aponte o `DATABASE_URL` para ele.

- **`SET NULL` de FK composta.** O drizzle-kit gera `ON DELETE set null`, que anularia também o `campaign_id` (`NOT NULL`) e faria a exclusão falhar. A `0033` foi editada à mão para `SET NULL ("parent_id")` / `SET NULL ("folder_id")` (Postgres 15+). Ao gerar a próxima migração, conferir que o drizzle-kit não tenta "corrigir" essas FKs; FK composta nova com `set null` precisa da mesma edição.

- **Nome do grid mora no snapshot.** A sala lê o nome da aba e do tabuleiro do `scene` do board (snapshot + `scene:updated`), não da biblioteca: mudança no `scenes` que a sala mostra precisa somar a versão do grid e publicar `scene:updated`; o `library:changed` só relê a biblioteca.
