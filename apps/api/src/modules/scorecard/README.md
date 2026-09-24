# scorecard module

Copy the pattern from `modules/ideas`: `scorecard.schema.ts` (zod, imported from @fi/contracts where shared) -> `scorecard.repo.ts` (SQL) -> `scorecard.service.ts` (rules) -> `scorecard.routes.ts` (HTTP).
Mount it in `src/app.ts`. Owner: see .github/CODEOWNERS and docs/team/squads.md.
