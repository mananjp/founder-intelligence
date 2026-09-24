# evidence module
Copy the pattern from `modules/ideas`: `evidence.schema.ts` (zod, imported from @fi/contracts where shared) -> `evidence.repo.ts` (SQL) -> `evidence.service.ts` (rules) -> `evidence.routes.ts` (HTTP).
Mount it in `src/app.ts`. Owner: see .github/CODEOWNERS and docs/team/squads.md.
