# FileDrop

FileDrop is a temporary file-sharing service. Drop a file, get a link, the
link expires and the file is gone — no account required.

```
Upload → Store → Generate Link → Open Link → Download → Expire → Delete
```

## Tech stack

- **Next.js (App Router) + TypeScript** — UI and server-side API routes
- **Tailwind CSS** — dark-mode UI
- **PostgreSQL + Prisma** — metadata storage
- **S3-compatible object storage** — file bytes (AWS S3, MinIO, Cloudflare R2,
  Backblaze B2, DigitalOcean Spaces, ...)
- **Vitest** — unit/integration tests

## How it works

1. The browser asks `POST /api/drops` for a share ID + a per-file upload URL,
   supplying only file names/sizes/MIME types and the chosen expiration.
2. The browser streams each file's bytes to its upload URL
   (`PUT /api/drops/:dropId/files/:fileId/content`) via XHR, which is how
   the upload progress bar and cancel button work. The server streams
   those bytes straight into object storage (no full-file buffering),
   sniffing the real MIME type from the first few KB and capping the
   total at `MAX_UPLOAD_SIZE_BYTES` — the declared size and browser
   `Content-Type` are never trusted on their own.
3. Once every file in the drop has uploaded, the drop flips to `ACTIVE` and
   is reachable at `/f/{shareId}` — a short, cryptographically random ID
   (see `src/lib/security/ids.ts`). The real storage key and bucket are
   never sent to the client.
4. Opening the link shows file name/size/type and time remaining, but never
   downloads automatically. Downloading calls
   `GET /api/share/:shareId/files/:fileId`, which atomically validates and
   records the download in a single UPDATE (see "Download limits and burn
   after read" below) before streaming the object back with a safe
   `Content-Disposition: attachment` header.
5. A cleanup job (see below) — and a lazy check on every link visit —
   deletes anything past its expiration.

## Project structure

```
prisma/schema.prisma        Drop + UploadFile models, indexes on shareId/expiresAt
src/
  app/
    page.tsx                Homepage (upload)
    f/[shareId]/page.tsx     Download page (server-checks expiration before rendering)
    api/
      drops/                 Create a drop, stream file bytes to storage
      share/[shareId]/        Metadata, password unlock, download
      cleanup/                 Cron-triggered expiry sweep (bearer-token protected)
  components/
    ui/                      Logo, Button, Card, CopyButton, QrCode, FileIcon
    upload/                  Dropzone, expiration picker, options panel, progress, success screen
    download/                Password gate, download card, expired state
  lib/
    prisma.ts                Prisma client singleton
    env.ts                   Validated environment config (zod)
    storage/s3.ts            S3-compatible client wrapper (put/get/delete, presigned URLs)
    validation/               Filename sanitization, size/type checks, zod request schemas
    security/                Share ID generation, password hashing, rate limiting, download tokens, scan() stub
    uploads/                  Drop creation, upload completion, atomic download claims
    cleanup/cleanup.ts        Idempotent expiry sweep, reused by the API route and the CLI script
    utils/                    Byte/time formatting, BigInt-safe JSON serialization
scripts/
  cleanup.ts                 Standalone cleanup runner for cron/systemd (no HTTP round trip)
  dev-s3.mjs                 Local S3-compatible mock server for development
tests/                        Vitest unit + integration tests
Dockerfile                    Multi-stage production image (see "Running with Docker")
docker-compose.yml            App + Postgres + MinIO + a scheduled cleanup container
docker-compose.override.yml.example  Template for deployment-specific tweaks (e.g. reverse-proxy network)
docker/entrypoint.sh          Runs `prisma migrate deploy` before the app/cleanup command
```

## Getting started

### Prerequisites

- Node.js 20+
- A PostgreSQL database
- An S3-compatible bucket (or run the bundled local mock — see below)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in `DATABASE_URL` and the `S3_*` values (see sections below), and
generate real secrets for `DOWNLOAD_TOKEN_SECRET` and `CLEANUP_SECRET`:

```bash
openssl rand -hex 32
```

### 3. Database setup

Create a database and apply migrations:

```bash
createdb filedrop   # or: CREATE DATABASE filedrop; via psql
npx prisma migrate dev
```

`npx prisma studio` gives you a quick GUI over the two tables (`Drop`,
`UploadFile`) if you want to poke at the data directly.

### 4. Object storage configuration

Any S3-compatible provider works — set these in `.env`:

| Variable                | Notes                                                   |
| ------------------------ | -------------------------------------------------------- |
| `S3_ENDPOINT`            | Provider's API endpoint                                  |
| `S3_REGION`              | e.g. `us-east-1` (most non-AWS providers accept this)    |
| `S3_BUCKET`               | Must already exist                                        |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Credentials with put/get/delete on the bucket |
| `S3_FORCE_PATH_STYLE`     | `true` for MinIO and most non-AWS providers; `false` for AWS S3 |

**No cloud account handy?** A local mock is included for development:

```bash
npm run dev:s3
```

This starts an S3-compatible server on `http://localhost:9000` with a
`filedrop` bucket already created — point `.env` at it with
`S3_ACCESS_KEY_ID=S3RVER` / `S3_SECRET_ACCESS_KEY=S3RVER`. It is **not** a
production storage backend — swap it for a real provider before deploying.

### 5. Run the app

```bash
npm run dev
```

Visit `http://localhost:3000`.

## Running with Docker

The steps above run FileDrop directly with Node; `docker compose` runs the
whole stack — the app, Postgres, MinIO (self-hosted S3-compatible storage),
and a scheduled cleanup container — with one command instead. This is the
easiest way to run FileDrop on a VM.

### 1. Configure

```bash
cp .env.docker.example .env.docker
```

Edit `.env.docker` — set real values for `POSTGRES_PASSWORD`,
`MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`, and generate the two secrets:

```bash
openssl rand -hex 32   # DOWNLOAD_TOKEN_SECRET
openssl rand -hex 32   # CLEANUP_SECRET
```

Set `NEXT_PUBLIC_APP_URL` to wherever you'll actually reach the app (e.g.
`https://your-domain.com` once you've put a reverse proxy in front of it —
see "Deploying" below).

This is a deliberately different file from `.env`/`.env.example` (which are
for running the app directly with `npm run dev`) — `docker-compose.yml`
sets `DATABASE_URL`/`S3_*` itself, wired to the `postgres`/`minio` service
names, so `.env.docker` only needs to supply credentials and app-level
config, not connection strings.

### 2. Build and start

```bash
docker compose --env-file .env.docker up -d --build
```

This builds the app image, starts Postgres and MinIO, creates the
`filedrop` bucket, applies database migrations (via `docker/entrypoint.sh`,
which runs `prisma migrate deploy` before the app starts), and starts a
`cleanup` container that runs the expiry sweep every 15 minutes — no host
cron needed. Visit `http://localhost:3000` (or your domain, once you've
put a reverse proxy in front — see "Deploying"). If something else on the
host already owns port 3000, set `APP_PORT` in `.env.docker` to a free
port instead — the container always listens on 3000 internally regardless
of which host port it's published on.

### 3. Operate it

```bash
docker compose --env-file .env.docker logs -f app       # tail app logs
docker compose --env-file .env.docker logs -f cleanup   # tail cleanup runs
docker compose --env-file .env.docker ps                # container status / health
docker compose --env-file .env.docker down               # stop everything
docker compose --env-file .env.docker down -v             # stop and wipe all data (careful)
```

Postgres and MinIO data live in named Docker volumes (`postgres-data`,
`minio-data`) — they persist across `docker compose up`/`down`, just not
across `down -v`.

If your build environment can't reach Docker Hub directly (e.g. it's
behind a restrictive proxy), override the base image with
`--build-arg NODE_BASE_IMAGE=your-mirror/node:20-bookworm-slim`.

**Bring your own Postgres/S3 instead of the bundled containers?** Skip
`docker-compose.yml` and just run the `app` image directly:

```bash
docker build -t filedrop .
docker run -d --name filedrop -p 3000:3000 --env-file .env filedrop
```

using the regular `.env` (from `.env.example`) pointed at your external
database/bucket. The container still runs `prisma migrate deploy` on
startup either way.

### Running behind a Docker-based reverse proxy

If your reverse proxy also runs in Docker — Nginx Proxy Manager, Traefik,
Caddy's docker-proxy, etc. — route to FileDrop over a shared Docker
network instead of through the host port mapping. It's more secure (the
app container is never reachable except through the proxy) and avoids
proxy-to-host networking quirks (`host.docker.internal` isn't reliable on
plain Linux Docker Engine).

1. Find the network your reverse proxy's own compose stack already
   created (`docker network ls` — commonly `<project-dir-name>_default`),
   or make a dedicated one:

   ```bash
   docker network create proxy_net
   ```

   Add it to your reverse proxy's compose file too if you created a new
   one, then restart that stack.

2. Copy `docker-compose.override.yml.example` to `docker-compose.override.yml`
   and swap in your actual network name if it's not `proxy_net`:

   ```bash
   cp docker-compose.override.yml.example docker-compose.override.yml
   ```

   Docker Compose merges this in automatically — no flags needed. Using an
   override file instead of editing `docker-compose.yml` directly matters:
   it's gitignored, so this deployment-specific tweak never conflicts with
   (or gets silently lost to) a future `git pull`. Then:

   ```bash
   docker compose --env-file .env.docker up -d
   ```

   Once that's up, you can also remove the `app` service's `ports:`
   mapping from `docker-compose.yml` if you like — once the proxy reaches
   `app` directly over the shared network, publishing the port to the host
   isn't needed. (If you do, that's an actual edit to the tracked file, so
   commit it rather than leaving it as local drift.)

3. In your reverse proxy's UI/config, point it at:
   - **Forward Hostname/IP:** `app` (the compose service name — Docker's
     embedded DNS resolves it automatically for containers on the same
     network)
   - **Forward Port:** `3000`

   For Nginx Proxy Manager specifically: Proxy Hosts → Add Proxy Host →
   Forward Hostname/IP `app`, Forward Port `3000`, Scheme `http`. Request
   a Let's Encrypt certificate under the SSL tab and force SSL. NPM's
   default proxy template already sets `X-Forwarded-For`/
   `X-Forwarded-Proto` (FileDrop's rate limiter and share-link generation
   depend on those being set correctly), so no extra header config is
   needed. Do add a body-size override under the Advanced tab, since NPM's
   default is too small for file uploads:

   ```
   client_max_body_size 210M;
   ```

   (matching, with headroom, whatever `MAX_UPLOAD_SIZE_BYTES` is set to).

## Development scripts

| Command              | What it does                                             |
| --------------------- | ---------------------------------------------------------- |
| `npm run dev`          | Start the dev server                                       |
| `npm run dev:s3`       | Start the local S3-compatible mock (development only)      |
| `npm run build`        | Production build                                            |
| `npm run start`        | Run the production build                                    |
| `npm run lint`         | ESLint                                                       |
| `npm test`             | Run the test suite once                                     |
| `npm run test:watch`   | Run tests in watch mode                                     |
| `npm run db:migrate`   | Create/apply a Prisma migration                             |
| `npm run db:studio`    | Prisma Studio (inspect the database)                         |
| `npm run cleanup`      | Run the expiry sweep once, directly against the DB/storage  |

## Cleanup job (expiration enforcement)

Expiration is enforced two ways, so a stale link is never downloadable:

1. **On demand** — every metadata fetch and download request checks
   `expiresAt` (and download limits / burn-after-read) itself, independent
   of whether the sweep below has run yet.
2. **On a schedule** — something needs to actually delete the objects from
   storage and mark the rows `DELETED`. Pick one:

**Option A — HTTP endpoint** (works with Vercel Cron, GitHub Actions,
`cron` + `curl`, any scheduler that can make an HTTP call):

```bash
curl -X POST https://your-deployment/api/cleanup \
  -H "Authorization: Bearer $CLEANUP_SECRET"
```

Example crontab entry (every 15 minutes):

```
*/15 * * * * curl -fsS -X POST https://your-deployment/api/cleanup -H "Authorization: Bearer $CLEANUP_SECRET"
```

**Option B — standalone script** (talks to Postgres/storage directly, no
running server required — handy for a traditional VM/cron setup):

```
*/15 * * * * cd /path/to/filedrop && npx tsx scripts/cleanup.ts >> /var/log/filedrop-cleanup.log 2>&1
```

The sweep is safe to run on any schedule and to overlap with itself: a
drop only flips to `DELETED` after every one of its storage objects is
confirmed deleted, and repeat deletes of an already-gone object are a
no-op, so a partial failure just gets retried next run.

## Security notes

- Share IDs are generated with `crypto.randomBytes` (~128 bits of entropy)
  — see `src/lib/security/ids.ts`.
- Uploaded file names are sanitized (path components, control characters,
  and header-unsafe characters stripped) before being stored or used in a
  `Content-Disposition` header.
- The declared file size/MIME type from the browser are never trusted:
  size is enforced against actual streamed bytes, and MIME type is
  sniffed from file content (`file-type` magic-number detection).
- Passwords are hashed with bcrypt; the plaintext is never stored or
  logged.
- Download-limit and burn-after-read enforcement happens in a single
  atomic SQL `UPDATE` (see `src/lib/uploads/download.ts`) so concurrent
  requests can't race past the intended limit.
- Storage keys and bucket names are never sent to the client; downloads
  are proxied through the app server with a safe, encoded
  `Content-Disposition` header.
- Basic in-memory rate limiting is applied to uploads, downloads,
  password attempts, and metadata lookups (`src/lib/security/rateLimit.ts`).
  It's per-process — for a multi-instance deployment, swap in a shared
  store (e.g. Redis/Upstash) behind the same `RateLimiter` interface.
- `src/lib/security/scan.ts` is a deliberate no-op extension point for
  wiring in real malware/content scanning later without touching call
  sites.

## Testing

```bash
createdb filedrop_test
DATABASE_URL=postgresql://user:pass@localhost:5432/filedrop_test npx prisma migrate deploy
npm test
```

Tests cover share ID generation, filename sanitization, file-size/type
validation, password hashing, download-token signing, expiration checks
(including a concurrency test proving download limits can't be raced), and
cleanup idempotency. Integration tests use a real Postgres database
(pointed at by `TEST_DATABASE_URL`, falling back to
`postgresql://filedrop:filedrop@localhost:5432/filedrop_test`) and mock
object storage, so they don't require a running S3 endpoint.

## Configuration reference

See `.env.example` for the full list. Notable ones:

- `MAX_UPLOAD_SIZE_BYTES` — hard per-file size cap, enforced server-side
  regardless of what the client claims (default 200 MB).
- `MAX_FILES_PER_DROP` — cap on files in a single drop (default 10).

## Deploying

FileDrop is a standard Next.js app — deploy it anywhere Next.js runs
(Vercel, a Node server, Docker, etc.). It needs:

- A reachable PostgreSQL instance with migrations applied
  (`npx prisma migrate deploy`).
- A real S3-compatible bucket (not the dev mock).
- The cleanup job scheduled (see above) — nothing deletes expired files on
  its own otherwise.
