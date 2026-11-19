# Deploy gateway

The gateway is a core Ultrastable capability: `core/deploygate` in ultrastable/workers, deployed as the Worker `ultrastable-deploy-gateway` in the ultrastable Cloudflare account. This tenant only supplies a rule in the gateway's `ALLOW` configuration (this repository, `refs/heads/main`, script `tenant-ps-web`). `.github/workflows/deploy-tenant.yml` sends the built bundle with the run's OIDC token; the gateway verifies it, deploys, and reads the bytes back. No secret is stored in this repository.
