# Security Scan Runbook

## Purpose

S1-7 adds PR-time and `main`-push security gates for repository secrets, package vulnerabilities, filesystem vulnerabilities, and container image vulnerabilities.

## Gates

| Scan          | Scope                                              | Threshold          | Failure condition                  |
| ------------- | -------------------------------------------------- | ------------------ | ---------------------------------- |
| Gitleaks      | Full Git history                                   | Secret detection   | Any detected secret                |
| `pnpm audit`  | Production dependency tree (`--prod`)              | 0 known advisories | Any reported advisory              |
| Trivy `fs`    | Repository working tree                            | HIGH and CRITICAL  | One or more HIGH/CRITICAL findings |
| Trivy `image` | `fi-api:security`, `fi-web:security`, `fi-ai:test` | HIGH and CRITICAL  | Actionable HIGH/CRITICAL findings  |

For container images, `ignore-unfixed: true` is enabled to focus the gate on actionable vulnerabilities where an upstream fix is available, avoiding false positives from upstream vendor-marked `will_not_fix` base-OS packages. The filesystem scan enforces zero HIGH/CRITICAL findings in application code.

## Image-scan flow

The existing `ai-container` job builds and health-checks `fi-ai:test`. After a successful healthcheck it exports the image as `fi-ai-test.tar.gz` and uploads it as a short-lived workflow artifact.

The `security-images` job depends on `ai-container`, downloads the artifact, loads `fi-ai:test`, builds the API and web images from their existing Dockerfiles, and scans all three images with Trivy.

This keeps S1-7 self-contained and does not depend on S1-9's GHCR push workflow.

## Dependency-audit note

`pnpm audit --prod` is used so the production workspace dependency tree must report 0 known advisories, matching the Sprint 1 production acceptance criteria.

## Troubleshooting

Run locally from the repository root:

```bash
pnpm audit --prod
```

```bash
trivy fs --severity HIGH,CRITICAL --exit-code 1 .
```

For an image:

```bash
trivy image --severity HIGH,CRITICAL --exit-code 1 fi-api:security
```

Do not add vulnerability ignores to make the pipeline green without documenting and approving the exception in the repository's security process.
