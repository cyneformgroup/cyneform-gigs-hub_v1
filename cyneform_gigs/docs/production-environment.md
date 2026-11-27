# Production environment

Set these values independently for API and worker containers. Inside production Compose, use `db` and `redis` as the database and Redis hostnames.

| Variable                                                              | Production guidance                                                                |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `DATABASE_URL`, `REDIS_URL`                                           | Use `db` and `redis` service names; set Redis to `redis://redis:6379`.             |
| `DB_ROOT_PASSWORD`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`               | Use unique, strong database credentials.                                           |
| `JWT_SECRET`, `ENCRYPTION_KEYS`, `BLIND_INDEX_KEY`, `FILE_URL_SECRET` | Generate strong independent secrets; never reuse development values.               |
| `UPLOAD_DIR`                                                          | Set to `/app/storage`, the persistent uploads volume included in backups.          |
| `APP_URL`, `CORS_ORIGIN`                                              | Set to the public HTTPS origin. Terminate TLS in a reverse proxy or load balancer. |
| `CALCOM_WEBHOOK_SECRET`                                               | Set if Cal.com webhooks are enabled.                                               |
| `SENTRY_DSN`, `VITE_SENTRY_DSN`                                       | Optional API/worker and browser Sentry DSNs.                                       |
| `NODE_ENV`                                                            | Set to `production`.                                                               |

Run database migrations once per release. Schedule `scripts/backup.sh` nightly and copy backups off-host weekly. Perform a restore drill into a scratch database monthly.
