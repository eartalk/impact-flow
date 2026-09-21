# Production deployment

Production is deployed from the `main` branch of:

```text
ssh://git@ssh.github.com:443/eartalk/impact-flow.git
```

## Deploy

Commit and push all intended changes, then run from the repository root:

```powershell
.\scripts\deploy.ps1
```

The script refuses to deploy when the local worktree is dirty or when local
`HEAD` differs from `origin/main`. The server then fetches and fast-forwards
the branch, builds the Docker images, recreates the services, and waits for the
HTTP health check.

On the first Git-based deployment, an existing non-Git deployment directory is
renamed with a `.legacy-<timestamp>` suffix. `.env.production` and `secrets/`
are copied into the new clone so that the existing database credentials and
Docker volumes remain usable.

## Common options

```powershell
.\scripts\deploy.ps1 -Branch main -AppPort 80
```

The server checkout is stored in `/home/ubuntu/impact-flow`. Runtime data is
kept in Docker named volumes and is not stored in Git.
