# experiments module

Copy the pattern from `modules/ideas`: `experiments.schema.ts` (zod, imported from @fi/contracts where shared) -> `experiments.repo.ts` (SQL) -> `experiments.service.ts` (rules) -> `experiments.routes.ts` (HTTP).
Mount it in `src/app.ts`. Owner: see .github/CODEOWNERS and docs/team/squads.md.
