# decisions module

Copy the pattern from `modules/ideas`: `decisions.schema.ts` (zod, imported from @fi/contracts where shared) -> `decisions.repo.ts` (SQL) -> `decisions.service.ts` (rules) -> `decisions.routes.ts` (HTTP).
Mount it in `src/app.ts`. Owner: see .github/CODEOWNERS and docs/team/squads.md.
