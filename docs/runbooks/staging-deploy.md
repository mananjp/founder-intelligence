# Render staging deployment

## Architecture

The deployment workflow runs after a push to `main`:

1. GitHub Actions builds the API, web, and AI Docker images and publishes both `sha-<7-character-commit>` and `latest` tags to GHCR.
2. The `staging` GitHub Environment triggers Render deploy hooks for `fi-api`, `fi-ai`, and `fi-worker`, explicitly requesting the SHA-tagged images built by that workflow run.
3. The workflow polls the API and AI `/health/ready` endpoints. A response other than HTTP 200 within the retry window fails the job.

The Render Blueprint is `infra/render.yaml`. It defines image-backed services; it does not build the services from the repository Dockerfiles. The web image is still published for the existing Vercel/production path; this Blueprint does not create a Render web service for the frontend.

## One-time Render setup

1. In Render Workspace Settings, add a container-registry credential named exactly `founder-intelligence-ghcr` for GitHub Container Registry. Use a GitHub token that can read the repository's packages (`read:packages`). Do not put this token in the repository or a workflow file.
2. Create or sync the Blueprint and set its Blueprint file path to `infra/render.yaml` (it is not at the repository root).
3. Add each service's runtime variables from the matrix below in that service's Render Environment page. Keep credentials in Render, not in YAML.
4. Copy the individual deploy hook URL from each service's Settings page. Render creates a different hook URL per service.
5. Confirm that the Render API and AI services expose their public HTTPS URLs and that the API can reach the AI service over Render's private network.

Render references:

- [Deploy hooks](https://render.com/docs/deploy-hooks)
- [Prebuilt Docker images and private GHCR credentials](https://render.com/docs/deploying-an-image)
- [Blueprint YAML reference](https://render.com/docs/blueprint-spec)
- [Health checks](https://render.com/docs/health-checks)

## GitHub staging Environment

Create a GitHub Environment named `staging`.

Configure these environment secrets:

| Secret                          | Purpose                                            |
| ------------------------------- | -------------------------------------------------- |
| `RENDER_API_DEPLOY_HOOK_URL`    | Deploy the API image                               |
| `RENDER_AI_DEPLOY_HOOK_URL`     | Deploy the AI image                                |
| `RENDER_WORKER_DEPLOY_HOOK_URL` | Deploy the worker image                            |
| `RENDER_API_TOKEN`              | Authenticate Render deployment-status API requests |

Configure these environment variables:

| Variable                   | Purpose                                                    |
| -------------------------- | ---------------------------------------------------------- |
| `STAGING_API_URL`          | Public HTTPS base URL for `fi-api`, without trailing slash |
| `STAGING_AI_URL`           | Public HTTPS base URL for `fi-ai`, without trailing slash  |
| `RENDER_API_SERVICE_ID`    | Render API service ID (`srv-...`)                          |
| `RENDER_AI_SERVICE_ID`     | Render AI service ID (`srv-...`)                           |
| `RENDER_WORKER_SERVICE_ID` | Render worker service ID (`srv-...`)                       |

The workflow triggers all three Render deployments using immutable SHA-tagged GHCR images and captures each deployment ID.

It then polls the Render API until all three deployments report `live`. A failed deployment, an invalid API response, or a timeout fails the GitHub Actions job.

Only after all three deployments are live does the workflow run HTTP readiness checks against the API and AI `/health/ready` endpoints.

Keep deploy-hook URLs and the Render API token in GitHub Environment secrets. Service IDs and public URLs are configuration variables, not secrets. Never commit credentials.

## Runtime environment-variable matrix

Set the following on the corresponding Render service. The `.env.example` file is the local-development reference; staging values must be supplied by the project owner and must not reuse local defaults.

| Variable                    | API (`fi-api`) |             AI (`fi-ai`)             |         Worker (`fi-worker`)         | Notes                                                                                                                                                                                                      |
| --------------------------- | :------------: | :----------------------------------: | :----------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                  |    Required    |                  —                   |                  —                   | Set to `production`.                                                                                                                                                                                       |
| `APP_ENV`                   |       —        |               Required               |               Required               | Set to `staging`; the AI settings reject the default internal token outside development.                                                                                                                   |
| `PORT`                      |     `4000`     |                `8000`                |                  —                   | Matches the ports currently used by the API and AI Docker commands.                                                                                                                                        |
| `API_PORT`                  |     `4000`     |                  —                   |                  —                   | Express API listener port; keep aligned with Render `PORT`.                                                                                                                                                |
| `DATABASE_URL`              |    Required    |               Required               |               Required               | API/Node `pg` URL should use `postgres://` or `postgresql://`. AI/worker SQLAlchemy URL should use `postgresql+psycopg://`. Use the same staging database, with the appropriate driver scheme per service. |
| `REDIS_URL`                 |    Required    |               Required               |               Required               | Shared staging Redis endpoint.                                                                                                                                                                             |
| `INTERNAL_SERVICE_TOKEN`    |    Required    |               Required               |               Required               | Use the same high-entropy value in all three services; never use `change-me`.                                                                                                                              |
| `SUPABASE_JWT_SECRET`       |    Required    |                  —                   |                  —                   | Staging Supabase JWT verification secret.                                                                                                                                                                  |
| `WEB_ORIGIN`                |    Required    |                  —                   |                  —                   | Exact HTTPS origin of the staging frontend.                                                                                                                                                                |
| `AI_SERVICE_URL`            |    Required    |                  —                   |                  —                   | AI service's internal/private Render URL, not its public browser URL.                                                                                                                                      |
| `RATE_LIMIT_WINDOW_MS`      |    Optional    |                  —                   |                  —                   | Defaults to 60000.                                                                                                                                                                                         |
| `RATE_LIMIT_API_LIMIT`      |    Optional    |                  —                   |                  —                   | Defaults to 300.                                                                                                                                                                                           |
| `RATE_LIMIT_INTERNAL_LIMIT` |    Optional    |                  —                   |                  —                   | Defaults to 1200.                                                                                                                                                                                          |
| `LLM_FAST_MODEL`            |       —        | Required when LLM stages are enabled | Required when LLM stages are enabled | Select the agreed fast-tier model.                                                                                                                                                                         |
| `LLM_STRONG_MODEL`          |       —        | Required when LLM stages are enabled | Required when LLM stages are enabled | Select the agreed strong-tier model.                                                                                                                                                                       |
| `LLM_EMBED_MODEL`           |       —        | Required when embeddings are enabled | Required when embeddings are enabled | Select the agreed embedding model.                                                                                                                                                                         |
| `OPENAI_API_KEY`            |       —        |         As provider requires         |         As provider requires         | Secret.                                                                                                                                                                                                    |
| `ANTHROPIC_API_KEY`         |       —        |         As provider requires         |         As provider requires         | Secret.                                                                                                                                                                                                    |
| `SEARCH_PROVIDER`           |       —        |               Optional               |               Optional               | Defaults to `tavily`.                                                                                                                                                                                      |
| `TAVILY_API_KEY`            |       —        |          If Tavily selected          |          If Tavily selected          | Secret.                                                                                                                                                                                                    |
| `EXA_API_KEY`               |       —        |           If Exa selected            |           If Exa selected            | Secret.                                                                                                                                                                                                    |
| `LANGFUSE_PUBLIC_KEY`       |       —        |               Optional               |               Optional               | Only when Langfuse tracing is enabled.                                                                                                                                                                     |
| `LANGFUSE_SECRET_KEY`       |       —        |               Optional               |               Optional               | Secret; only when Langfuse tracing is enabled.                                                                                                                                                             |
| `RUN_BUDGET_USD_QUICK`      |       —        |               Optional               |               Optional               | Defaults to 1.00 in the local example; set the approved staging budget.                                                                                                                                    |
| `RUN_BUDGET_USD_STANDARD`   |       —        |               Optional               |               Optional               | AI settings default to 4.00.                                                                                                                                                                               |
| `RUN_BUDGET_USD_DEEP`       |       —        |               Optional               |               Optional               | AI settings default to 12.00.                                                                                                                                                                              |

The frontend is not part of this Render Blueprint. Its Vercel environment uses `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the staging Supabase project.

## Health and smoke checks

- Render's API and AI web services both use `/health/ready` as their health-check path. Each endpoint returns HTTP 200 only when its database and Redis checks pass; otherwise it returns HTTP 503.
- The GitHub Actions smoke step checks both public staging URLs and fails the deployment job if either endpoint does not return HTTP 200 within ten minutes.
- `fi-worker` is a background worker and has no HTTP readiness endpoint. Its deploy hook must succeed; confirm the worker process is running in the Render Events/Logs view after deployment.

## Blockers / handover

The staging workflow cannot complete until the project manager finishes S2-41 (#80) and supplies/configures:

- the Render workspace and three per-service deploy hooks;
- the GHCR read-only registry credential;
- staging Postgres and Redis connection details;
- Supabase, internal-service, and provider secrets listed above;
- the API and AI staging URLs and the private AI service address.

The GitHub job intentionally fails with a list of missing `staging` environment values instead of silently skipping deployment. Never commit any of these values.
