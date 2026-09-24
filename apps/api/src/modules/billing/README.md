# billing module
Copy the pattern from `modules/ideas`: `billing.schema.ts` (zod, imported from @fi/contracts where shared) -> `billing.repo.ts` (SQL) -> `billing.service.ts` (rules) -> `billing.routes.ts` (HTTP).
Mount it in `src/app.ts`. Owner: see .github/CODEOWNERS and docs/team/squads.md.
