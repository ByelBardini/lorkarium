# Tokens — armadilhas

Detalhe do hub [`../tokens.md`](../tokens.md).

- Renomear coluna no PO faz o `drizzle-kit generate` perguntar "foi renomeada?" e ele falha sem TTY. Contorno: gerar com a coluna velha ainda no PO (adiciona as novas), escrever a cópia dos dados nessa migração e gerar de novo sem ela (só o `DROP`). O par `0013_token_box` + `0014_token_box_drop_size` é o exemplo.

- O enum novo só vira `CREATE TYPE` na migração se for exportado em `server/src/database/schema.ts`; sem isso o `drizzle-kit generate` cria a coluna apontando para um tipo que não existe.
- Um comando com `as const` no spec vira tupla `readonly` e não cabe no tipo do DTO (arrays mutáveis): tipe a fixture (`const NEW_TOKEN: CreateToken = …`).
- Um `CHECK` aceita `NULL`: `a IS NULL AND b IS NULL OR (a BETWEEN 0 AND 100 AND b BETWEEN 0 AND 100)` deixa passar só um dos dois nulo (o segundo ramo vira `NULL`, não `false`). O `tokens_sight_range` nomeia `IS NOT NULL` nos dois no segundo ramo; o `tokens-dao.spec.ts` prova ("only the bright set").
- Num `db.select({ … }).from(tokens)` o Drizzle tira o nome da tabela de **toda** coluna interpolada, também dentro de uma subconsulta `sql` (`"token_id" = "id"` vira o id da própria subconsulta): as subconsultas do `hangingOf` (`FORMS_OF_TOKEN`, `OWN_CONTROLLER_IDS`) escrevem os nomes por extenso com alias. No `UPDATE`/`execute` as colunas saem qualificadas.
