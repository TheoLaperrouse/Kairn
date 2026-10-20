# Kairn

Trail and ultra-trail training planner. npm workspaces monorepo: `apps/api` (Node, Fastify, `node:sqlite`, TypeScript run by tsx) and `apps/web` (Vue 3, Pinia, Vite). Deployed with Docker on a Raspberry Pi behind a Cloudflare tunnel (HTTPS); see `deploy/` and the README.

## Language

- **No French in the code.** Identifiers, enum values, file names, comments, JSDoc, test names and fixture variable names are in English.
- **Every message a person reads stays in French**: UI text, error messages returned by the API (including validation errors, see `validation-messages.ts`), push notifications, server logs, script and console output, README. Never translate these when translating code.
- French copy speaks to the runner informally (« ton plan », « tu »), uses French typography: `’` apostrophes, « guillemets », a space before `:`, decimal commas through `formatNumber`.

## Commands

```bash
npm run dev         # API on :3000, web on :5173 (proxies /api)
npm run typecheck   # both workspaces
npm test            # vitest, both workspaces
npm run build       # web build (also emits dist/sw.js)
```

All three of typecheck, test and build must pass before handing work back. For UI changes, also check the page in a browser.

## Architecture

- **API, hexagonal:**
  - `domain/` holds the pure business rules (no I/O, no dates from the system clock; `today` is passed in).
  - `application/use-cases` orchestrate them through the interfaces in `application/ports`.
  - `infrastructure/` implements the ports (SQLite repositories, HTTP routes and JSON schemas, file parsers, Strava, web push, FIT/ICS encoders).
  - Wiring happens in `main.ts` and, for tests, `test/fixtures/test-app.ts`. Keep both in sync.
- **Web**, mirrored layout:
  - `domain/models.ts` mirrors the API JSON exactly, and `domain/format.ts` holds formatting, labels and `errorMessage`.
  - `application/stores` are the Pinia stores and `infrastructure/` the HTTP and push adapters.
  - `ui/` holds components, composables and views. Large views are split into sub-components under `ui/views/<view>/`.
- **Storage:** SQLite tables hold JSON documents (`data` column). Migrations in `database.ts` are versioned with `PRAGMA user_version` and only ever appended, never edited. The app has no real users yet, so dropping old data is acceptable when it simplifies things; say so explicitly.
- **Service worker:** `apps/web/service-worker.js` is a template. The Vite plugin in `vite.config.ts` injects the precache list and version into `dist/sw.js`. It caches the app shell and the last API responses for offline use, and clears the data cache on logout.

## Code style

- TypeScript strict, ES modules. No semicolons, single quotes, 2-space indent, trailing commas, long lines (up to ~150 chars) are fine. The repo is **not** formatted with Prettier: do not run it on existing files, match the surrounding code by hand.
- Enum-like values are string unions in `SCREAMING_SNAKE_CASE`. Their French labels live in `Record<Union, string>` maps (for example `SESSION_TYPE_LABELS`).
- Comments are sparse and explain *why* or a non-obvious rule, usually a one-line `/** … */` above a constant or function. Name magic numbers as constants with such a comment. No comments that restate the code.
- Reuse shared helpers instead of re-implementing them:
  - API: `domain/shared/math.ts` (`clamp`, `round1`, `round2`, `roundTo`, `mean`, `median`) and `domain/shared/dates.ts`.
  - Web: `domain/format.ts`, `domain/race-time.ts`, and `ui/components/chart.ts` for SVG charts.
- Vue: `<script setup lang="ts">`, scoped styles built on the CSS variables from `ui/styles/tokens.css` (colours, `--space-*`, `--radius*`), icons from `lucide-vue-next`. Light and dark themes must both work.
- Prefer simple code: remove dead code and duplication, avoid abstractions with a single caller, avoid new dependencies when a few lines do the job.
- Keep behaviour identical in refactors. When a change alters behaviour or the HTTP contract, update API and web together, since they are deployed together.

## Tests

- Vitest, test names in English. Domain tests build data with `test/fixtures/tracks.ts` and `factories.ts`. HTTP tests run the whole app on in-memory SQLite through `buildTestApp` with a fixed clock.
- Add tests with every new rule or route, including the French messages users see.

## Git

- Never commit or push without being asked. Commits are authored by the user only, with no AI attribution lines.
- Commit messages follow the existing history: a short summary line, then bullet points.
- Branch `main`, remote `TheoLaperrouse/Kairn` (public): check the diff for secrets before every push. `.env`, databases and `deploy/.env` must never be committed.
