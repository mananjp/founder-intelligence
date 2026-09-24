# Terraform (Production path)

```
terraform/
  modules/   network, ecs-service, rds-postgres, redis, s3, cloudfront-waf, secrets, observability
  envs/
    staging-uae/    (me-central-1)
    prod-uae/       (me-central-1)
    prod-india/     (ap-south-1)
```
MVP does not need Terraform: it runs on Vercel + Render/Railway + Supabase + Upstash.
Start writing modules in the Production-hardening sprints (see blueprint §9).
Owner: Platform squad (Rishi lead, Rahil).
