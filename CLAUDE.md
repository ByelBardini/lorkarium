# CLAUDE.md

**YOU MUST** load @AGENTS.md at the start of every task before exploring or editing this repository. It defines stack, layout, the server layers (PO, DAO, BO, DTO, VO), the `docs/context/` area table, and where tests run. This file adds style, test commands, and agent behavior only. The product spec is `docs/spec.md`.

## Language

- Code identifiers, file and folder names: English (the spec already fixes `Campaign`, `/campaigns`, `token:moved`).
- Docs (`docs/`), commit messages, plans and `.claude/` commands: pt-BR.

## Planning

- Plan only when asked. No code until told to proceed.
- Interview me on non-trivial features (3+ steps) before writing code.
- Max 5 files per refactor phase. Verify, get approval, then continue. If the user cannot reply, summarize completed work and pending steps, then stop—do not expand the phase unilaterally.

## Code Style

- Functions: 4–20 lines. Files: under 500 lines. One responsibility each.
- Names: specific, unique. Avoid `data`, `handler`, `Manager`. Prefer names that return <5 grep hits in the codebase.
- Types: explicit. No `any`, no untyped functions.
- No duplication. Extract shared logic. Game rules shared by client and server live once, in `packages/game-core`.
- Early returns over nested ifs. Max 2 indentation levels.
- Exception messages must include the offending value and expected shape.

## Comments

- Default: no comments. Only write WHY, never WHAT.
- Don't strip existing comments on refactors — they carry intent.
- Docstrings on public functions: intent + one usage example (an `Example:` line).
- Reference issue numbers/SHAs when a line exists due to a specific bug.

## Tests

- `pnpm test` at the root runs Vitest for every workspace (`projects` in `vitest.config.ts`). One spec: `pnpm exec vitest run <path>`; one workspace: `pnpm exec vitest run --project @lorkarium/<name>`. One layer with coverage (what CI runs): `pnpm test:packages`, `test:client`, `test:server`, `test:integration`. `pnpm typecheck` is mandatory too: Vitest does not type-check (it does check specs: `test` is in every tsconfig).
- Every new function gets a test. Bug fixes get a regression test.
- Tests NEVER live next to source code. Each workspace keeps its specs in `<workspace>/test/`, mirroring `src/`. Server integration specs (Fastify `inject`, real Postgres, real Socket.IO client) go in `server/test/integration/`.
- Specs import production code via the workspace alias (`@/...` in `client/`), never by relative path into `src/`. Workspaces without an alias yet (`server/`, `packages/*`) import relatively until the alias is configured — configuring it is a decision to ask for.
- Mock external I/O with named fake classes, not inline stubs.
- F.I.R.S.T: fast, independent, repeatable, self-validating, timely.
- Full guide (scenarios before coverage, red first, proof the test bites, regression, broken test) and the spec audit: skill `/testar` in `.claude/skills/testar/`.

## Dependencies & Structure

- Inject via constructor/parameter. Never global import (the DAO receives `db`/`tx`; it never imports the instance).
- Wrap third-party libs behind a thin project-owned interface (a `*.port.ts` with one adapter in `server/src/infrastructure/`; PixiJS only in `client/src/renderer/`, Socket.IO client only in `client/src/services/`, Zustand only in `client/src/stores/`).
- Modular monolith: one folder per feature module in `server/src/modules/`, one per feature area in `client/src/features/`. Small focused modules over god files.
- `packages/game-core` is pure TypeScript with no runtime dependency (no React, PixiJS, Fastify, Socket.IO, `node:`). `packages/contracts` depends only on `zod`.
- Validate every input (HTTP body/params, Socket.IO payload) with the Zod DTO from `@lorkarium/contracts` at the edge. Building a new server slice: skill `/desenvolver-server`.

## Server Authority

- The server is the authority over shared state (spec §2.2). The client sends commands and renders confirmed state.
- The requester's identity comes from the authenticated session/connection, never from the payload (spec §7.3).
- Persist before confirming; publish events with an id and a state version (spec §5.5).
- Every query of campaign data filters by the session's campaign (spec §2.6).

## Formatting & Logging

- Use `prettier` (`pnpm format`; `pnpm format:check` in CI). Don't discuss style beyond that.
- Structured JSON for debug/observability (the Fastify pino logger: `request.log`, `app.log`). Plain text for CLI output.

## Agent Behavior

- **Always** read the relevant `docs/context/<area>.md` **before** opening any source file. This is the primary way to understand the domain — reading source first wastes tokens and misses intent. No doc for the area yet: read the matching section of `docs/spec.md`.
- Big areas are a **hub + subfolder**: `docs/context/<area>.md` is the index, `docs/context/<area>/*.md` the detail. Read the hub, then open only the sub-file the task needs — never the whole folder.
- After any change that affects the API contract, events, DTOs, data model, env vars, or repo structure: update the corresponding `docs/context/<area>.md` (and its row in the AGENTS.md table for new areas). The doc is the source of truth for future tasks.
- Re-read files before editing after 10+ messages (compaction risk).
- Files >500 LOC: read in chunks with offset/limit.
- Context docs have a ceiling: **200 lines and 25 KB**. Split what goes past it into the area subfolder and add the line to the hub index.
- On rename/signature change: grep for calls, types, imports, re-exports — across every workspace.
- Never delete a file without verifying no references exist.
- If a fix fails twice: stop, re-read the full section, state the wrong assumption.
- After correction: log the pattern in the "Armadilhas" section of the relevant area — `docs/context/<area>/armadilhas*.md` when the area has a subfolder, otherwise the section in `docs/context/<area>.md`.
- NEVER add yourself as commit co-author: no `Co-Authored-By`, no "Generated with Claude Code" lines in commits or PRs.
- "yes" / "do it" / "push" → execute. Don't restate the plan.
- Work from raw error data. If no output provided, ask for it.
