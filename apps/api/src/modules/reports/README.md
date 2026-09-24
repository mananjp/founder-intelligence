# reports module
Copy the pattern from `modules/ideas`: `reports.schema.ts` (zod, imported from @fi/contracts where shared) -> `reports.repo.ts` (SQL) -> `reports.service.ts` (rules) -> `reports.routes.ts` (HTTP).
Mount it in `src/app.ts`. Owner: see .github/CODEOWNERS and docs/team/squads.md.
