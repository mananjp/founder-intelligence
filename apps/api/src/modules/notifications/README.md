# notifications module

Copy the pattern from `modules/ideas`: `notifications.schema.ts` (zod, imported from @fi/contracts where shared) -> `notifications.repo.ts` (SQL) -> `notifications.service.ts` (rules) -> `notifications.routes.ts` (HTTP).
Mount it in `src/app.ts`. Owner: see .github/CODEOWNERS and docs/team/squads.md.
