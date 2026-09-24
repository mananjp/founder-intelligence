# customers module

Copy the pattern from `modules/ideas`: `customers.schema.ts` (zod, imported from @fi/contracts where shared) -> `customers.repo.ts` (SQL) -> `customers.service.ts` (rules) -> `customers.routes.ts` (HTTP).
Mount it in `src/app.ts`. Owner: see .github/CODEOWNERS and docs/team/squads.md.
