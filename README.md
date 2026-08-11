# FileDrop

FileDrop is a temporary file-sharing service. Drop a file, get a link, the
link expires and the file is gone — no account required. Two ways to send:

- **Upload** — the file is stored (temporarily) on the server, so the
  sender doesn't need to stay online for the receiver to download it.
- **Peer-to-peer** — the file goes straight from the sender's browser to
  the receiver's over WebRTC, never touching server storage. Good for
  large files or anything you'd rather not have land on a server, at the
  cost of both browsers needing to be online at the same time. See
  "Peer-to-peer transfers" below.

```
Upload → Store → Generate Link → Open Link → Download → Expire → Delete
```

## Tech stack

- **Next.js (App Router) + TypeScript** — UI and server-side API routes
- **Tailwind CSS** — dark-mode UI
- **PostgreSQL + Prisma** — metadata storage
- **S3-compatible object storage** — file bytes for the upload flow (AWS S3,
  MinIO, Cloudflare R2, Backblaze B2, DigitalOcean Spaces, ...)
- **WebRTC + a small custom WebSocket signaling server** — peer-to-peer
  transfers (`server.ts`, `src/lib/p2p/`); optionally **coturn** as a TURN
  relay fallback for restrictive NATs/firewalls
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

**Deleting early.** There are no accounts, so the only proof that you're
the one who created a drop is a capability token (`deleteToken`) shown
once, right on the success screen, after upload — a "Delete Now" button
right there uses it immediately via `DELETE /api/share/:shareId`, no need
to copy or save it anywhere. Refresh the page or come back later and
it's gone from view — same trade-off as everything else here (no
accounts, nothing persisted client-side), so use it in the moment if you
need it.

**Large files get a shorter expiration automatically.** A file at or over
`LARGE_FILE_THRESHOLD_BYTES` (default 1 GB) has its expiration capped to
`LARGE_FILE_MAX_EXPIRATION` (default 24 hours) regardless of what was
selected — longer-lived large files cost more in storage and extend the
exposure window for anything sensitive. It only ever shortens: picking
something already under the cap is left alone, and the response tells
the UI whether this happened (`expirationClamped`) so it can explain why.
Doesn't apply to peer-to-peer transfers, which never touch server storage
in the first place. Note this only has any effect once
`MAX_UPLOAD_SIZE_BYTES` (default 200 MB) is raised above the threshold —
see "Configuration reference".

## Peer-to-peer transfers

The `/p2p` tab is a second, independent way to send a file — it never
touches object storage, and the server only ever sees a small metadata
row (file name/size/MIME type, optional password hash, expiry) plus the
WebRTC handshake, not the file itself.

1. The sender picks a file at `/p2p`, sets an expiration and optional
   password, and `POST /api/p2p` creates that metadata row and returns a
   share link (`/p2p/{shareId}`) — same random-ID scheme as the upload
   flow.
2. Both browsers open a WebSocket to `/ws/p2p/signal` (a custom server —
   see `server.ts` — since plain Next.js route handlers can't hold a
   WebSocket connection open). This signaling server relays only the
   small SDP offer/answer and ICE candidates two `RTCPeerConnection`s
   need to find each other; it never sees file bytes and holds nothing
   in a database — rooms are in-memory, keyed by `shareId`, and hold at
   most one sender and one receiver.
3. Once connected, the file streams directly browser-to-browser over an
   `RTCDataChannel`, in 64KB chunks with backpressure (see
   `src/lib/p2p/client/webrtc.ts`). The receiver writes it straight to
   disk via the File System Access API when the browser supports it
   (Chrome/Edge), or buffers it in memory and triggers a normal download
   otherwise (Firefox, Safari).
4. **Both tabs need to stay open for the whole transfer** — there's
   nothing on the server to resume from if either side closes early. If
   the receiver's tab reconnects (a network blip, not a full close), the
   sender automatically re-offers and the transfer can pick back up
   without a page reload.

By default, the two browsers try to connect directly, using only a
public STUN server to discover their own reachable address — this works
on most networks. Some NATs/firewalls block direct peer connections
entirely, in which case a TURN relay is the only way through. FileDrop
can use your own **coturn** instance for this:

- Not required — P2P works without it on most networks; it's a fallback
  for the networks where a direct connection isn't possible.
- Configure `TURN_SECRET`/`TURN_EXTERNAL_IP` (running directly — see
  "Configuration reference") or the same variables in `.env.docker`
  (running via Docker Compose — see "Running with Docker").
- Ephemeral credentials are minted per-connection using coturn's
  standard "TURN REST API" convention (HMAC-SHA1 over a timestamp,
  10-minute TTL) — see `src/lib/p2p/turnCredentials.ts`. Nothing is
  persisted; coturn verifies these itself by recomputing the same HMAC.

**Running behind a reverse proxy?** `/ws/p2p/signal` is a WebSocket
endpoint on the same host/port as the rest of the app — make sure your
proxy forwards `Upgrade`/`Connection` headers for it. Nginx Proxy
Manager does this automatically as long as **Websockets Support** is
enabled on the Proxy Host (Details tab) — the same proxy host you
already set up for the rest of the app covers this too, no separate host
needed.

## Project structure

```
prisma/schema.prisma        Drop + UploadFile + P2pTransfer models
server.ts                   Custom server (Next.js + the P2P signaling WebSocket on one port)
src/
  app/
    page.tsx                Homepage (upload)
    f/[shareId]/page.tsx     Download page (server-checks expiration before rendering)
    p2p/page.tsx             Peer-to-peer send flow
    p2p/[shareId]/page.tsx    Peer-to-peer receive flow
    api/
      drops/                 Create a drop, stream file bytes to storage
      share/[shareId]/        Metadata, password unlock, download
      p2p/                     Create/fetch/unlock a P2P transfer, ICE server config
      cleanup/                 Cron-triggered expiry sweep (bearer-token protected)
  components/
    ui/                      Logo, Button, Card, CopyButton, QrCode, FileIcon, ProgressBar
    upload/                  Dropzone, expiration picker, options panel, progress, success screen
    download/                Password gate, download card, expired state
    p2p/                     Mode tabs, review step, status panel, send/receive flows
  lib/
    prisma.ts                Prisma client singleton
    env.ts                   Validated environment config (zod)
    storage/s3.ts            S3-compatible client wrapper (put/get/delete, presigned URLs)
    validation/               Filename sanitization, size/type checks, zod request schemas
    security/                Share ID generation, password hashing, rate limiting, download tokens, scan() stub
    uploads/                  Drop creation, upload completion, atomic download claims
    p2p/                     Signaling server, TURN credentials, transfer metadata service
    p2p/client/               Browser-side WebRTC transfer engine + File System Access/Blob sinks
    cleanup/cleanup.ts        Idempotent expiry sweep, reused by the API route and the CLI script
    utils/                    Byte/time formatting, BigInt-safe JSON serialization
scripts/
  cleanup.ts                 Standalone cleanup runner for cron/systemd (no HTTP round trip)
  dev-s3.mjs                 Local S3-compatible mock server for development
tests/                        Vitest unit + integration tests
Dockerfile                    Multi-stage production image (see "Running with Docker")
docker-compose.yml            App + Postgres + MinIO + a scheduled cleanup container + optional coturn
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

`npx prisma studio` gives you a quick GUI over the tables (`Drop`,
`UploadFile`, `P2pTransfer`) if you want to poke at the data directly.

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

### Optional: TURN relay for peer-to-peer transfers

Peer-to-peer transfers work without this — it's only a fallback for
networks where two browsers can't establish a direct connection (see
"Peer-to-peer transfers" above). To run your own relay, set
`TURN_SECRET` and `TURN_EXTERNAL_IP` (the VM's public IP) in
`.env.docker`, then start compose with the `p2p-turn` profile so the
bundled `coturn` service actually starts:

```bash
docker compose --profile p2p-turn --env-file .env.docker up -d
```

This publishes `3478/udp`, `3478/tcp`, and a UDP relay port range
(`49160-49200` by default, configurable via `TURN_MIN_PORT`/
`TURN_MAX_PORT` in `.env.docker`) — open those in any firewall/security
group in front of the VM, in addition to whatever you already opened for
the app itself.

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
   `filedrop-app` directly over the shared network, publishing the port to
   the host isn't needed. (If you do, that's an actual edit to the tracked
   file, so commit it rather than leaving it as local drift.)

3. In your reverse proxy's UI/config, point it at:
   - **Forward Hostname/IP:** `filedrop-app` — **not** `app`. The override
     example gives this container an explicit alias rather than relying
     on the default (service-name-based) one, because Nginx Proxy
     Manager's own official docker-compose setup also names its service
     `app` — two containers sharing that alias on the same network means
     Docker's DNS can resolve it to *either* one, and your reverse proxy
     may end up routing to itself instead of FileDrop. `filedrop-app` sidesteps
     that regardless of what your reverse proxy's own service happens to
     be named.
   - **Forward Port:** `3000`

   For Nginx Proxy Manager specifically: Proxy Hosts → Add Proxy Host →
   Forward Hostname/IP `filedrop-app`, Forward Port `3000`, Scheme `http`.
   Request a Let's Encrypt certificate under the SSL tab and force SSL.
   NPM's default proxy template already sets `X-Forwarded-For`/
   `X-Forwarded-Proto` (FileDrop's rate limiter and share-link generation
   depend on those being set correctly), so no extra header config is
   needed. Do add a body-size override under the Advanced tab, since NPM's
   default is too small for file uploads:

   ```
   client_max_body_size 210M;
   ```

   (matching, with headroom, whatever `MAX_UPLOAD_SIZE_BYTES` is set to).
   Also turn on **Websockets Support** on the Details tab — needed for
   peer-to-peer transfers' signaling connection (`/ws/p2p/signal`); the
   rest of the app works fine without it, but P2P won't.

## Development scripts

| Command              | What it does                                             |
| --------------------- | ---------------------------------------------------------- |
| `npm run dev`          | Start the dev server (`server.ts` — Next.js + the P2P signaling WebSocket) |
| `npm run dev:s3`       | Start the local S3-compatible mock (development only)      |
| `npm run build`        | Production build                                            |
| `npm run start`        | Run the production build (`server.ts`, same as above)       |
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

The same sweep also hard-deletes expired `P2pTransfer` rows — there's no
storage object to worry about there (the file was never uploaded
anywhere), just the small metadata row itself.

## Security notes

- Share IDs are generated with `crypto.randomBytes` (~128 bits of entropy)
  — see `src/lib/security/ids.ts`. The delete-now capability token is the
  same generator at a longer length (~190 bits), compared with a
  constant-time check (`timingSafeEqual`) so a timing side-channel can't
  narrow it down byte by byte.
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
- The above all applies to peer-to-peer transfers too, where relevant:
  passwords are bcrypt-hashed, the signaling WebSocket is rate-limited
  by IP (`p2pSignalRateLimiter`), and a password-protected transfer's
  signaling connection requires the same short-lived HMAC token used to
  gate downloads on the upload flow (issued after a correct password
  check, verified on WebSocket upgrade — see
  `src/lib/p2p/signalingServer.ts`). The signaling server itself never
  sees file bytes, only the SDP/ICE handshake, and holds no database
  state of its own — an unauthorized or expired connection is closed
  with a specific WebSocket close code rather than ever being handed a
  live signaling session.

## Testing

```bash
createdb filedrop_test
DATABASE_URL=postgresql://user:pass@localhost:5432/filedrop_test npx prisma migrate deploy
npm test
```

Tests cover share ID generation, filename sanitization, file-size/type
validation, password hashing, download-token signing, expiration checks
(including a concurrency test proving download limits can't be raced),
early deletion via the delete-token capability, the large-file
expiration cap, cleanup idempotency (for both the upload flow and
peer-to-peer transfers), the P2P transfer metadata service (creation,
expiry, password unlock, authorized-vs-not response shape), and TURN
credential generation. Integration tests use a real Postgres database
(pointed at by `TEST_DATABASE_URL`, falling back to
`postgresql://filedrop:filedrop@localhost:5432/filedrop_test`) and mock
object storage, so they don't require a running S3 endpoint. Test files
run sequentially rather than in parallel (`fileParallelism: false` in
`vitest.config.ts`) since they share one real database and each resets
it independently — running them concurrently made failures flaky rather
than deterministic.

The signaling WebSocket and the actual WebRTC data channel aren't
covered by the Vitest suite (they need two real browsers, not just a
Node test runner) — those were verified with real two-browser Playwright
sessions during development, confirming an end-to-end transfer's bytes
match exactly (SHA-256) on both the plain and password-protected paths.

## Configuration reference

See `.env.example` for the full list. Notable ones:

- `MAX_UPLOAD_SIZE_BYTES` — hard per-file size cap, enforced server-side
  regardless of what the client claims (default 200 MB). Doesn't apply
  to peer-to-peer transfers — those never touch server storage.
- `MAX_FILES_PER_DROP` — cap on files in a single drop (default 10).
- `LARGE_FILE_THRESHOLD_BYTES` / `LARGE_FILE_MAX_EXPIRATION` — see "Large
  files get a shorter expiration automatically" above (defaults: 1 GB,
  24 hours). Only relevant if `MAX_UPLOAD_SIZE_BYTES` is raised above the
  threshold — at the 200 MB default, no upload can reach 1 GB in the
  first place, so this has no effect until both are changed together.
- `TURN_SECRET` / `TURN_EXTERNAL_IP` / `TURN_PORT` — optional, enable a
  TURN relay fallback for peer-to-peer transfers (see "Peer-to-peer
  transfers" above). Both `TURN_SECRET` and `TURN_EXTERNAL_IP` need to be
  set for TURN to activate; leaving them unset just means
  `getIceServers()` returns the public STUN server only.

## Deploying

FileDrop is a standard Next.js app — deploy it anywhere Next.js runs
(Vercel, a Node server, Docker, etc.). It needs:

- A reachable PostgreSQL instance with migrations applied
  (`npx prisma migrate deploy`).
- A real S3-compatible bucket (not the dev mock).
- The cleanup job scheduled (see above) — nothing deletes expired files on
  its own otherwise.
