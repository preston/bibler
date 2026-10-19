# Bibler

Bibler brings scripture search and comparison, collaborative Bible studies, sermon planning, document extraction, and scripture-grounded AI assistance into one application.

The repository uses one npm lockfile and three workspaces: `core/` (`bibler-core`) holds browser-safe contracts, `server/` (`bibler-server`) runs TypeScript/Express with Prisma, and `ui/` (`bibler-ui`) runs Angular and Bootstrap. Use Node 26, npm 12, Angular 22.2, TypeScript 6.0, Prisma 7.10, and PostgreSQL 18. Build shared core before either application.

## Local development

Install Docker with Compose, Node 26, and npm 12. Run commands from the repository root:

```sh
npm ci
npm run prisma:generate
cp server/.env.example server/.env
npm run docker:up
npm run start:server
```

In a second terminal:

```sh
npm run start:ui
```

The UI opens at [localhost:4200](http://localhost:4200), the API at [localhost:3000/api](http://localhost:3000/api), and PostgreSQL at `localhost:5433`. `docker-compose.development.yml` starts only PostgreSQL. Server startup verifies and migrates the database before accepting traffic; seeding and content imports are explicit operations.

`BIBLER_SERVER_URL` is the browser-visible server origin, without `/api`; the UI defaults to `http://localhost:3000`. `npm run start:ui` and `npm run build:ui` generate runtime configuration and copy the PDF worker into assets. Containers substitute the server origin when nginx starts, so the same UI image supports different API deployments.

## Configuration and content

Copy `server/.env.example` for host processes and optionally `.env.example` to `.env` for Compose overrides. Server commands load `server/.env`. Compose supplies container DNS for PostgreSQL and a browser-visible UI server origin; it can also read optional server settings from `server/.env`.

| Setting | Purpose |
| --- | --- |
| `BIBLER_SERVER_DATABASE_URL` | PostgreSQL connection URL for the API, Prisma, and database commands |
| `BIBLER_SERVER_PORT` | API listening port, default `3000` |
| `BIBLER_SERVER_URL` | UI's browser-visible API origin, without `/api` |
| `BIBLER_DATABASE_HOST_PORT` | Compose PostgreSQL host port, default `5433` |
| `BIBLER_SERVER_BIBLE_DATABASES_PATH` | Scripture source checkout for explicit imports |
| `BIBLER_SERVER_OLLAMA_URL` | External Ollama origin; host development normally uses `http://localhost:11434` |
| `BIBLER_SERVER_OLLAMA_MODEL` | Optional default model; defaults to `bigwest60/bible-scholar:latest` |
| `BIBLER_SERVER_OLLAMA_TEST_MODEL` | Optional model override for the explicit live smoke check only |
| `BIBLER_IMAGE_TAG` | Compose application image tag, default `latest`; use a commit SHA for releases |

The sibling `bible_databases` checkout is read-only input. For host commands, its default example path is relative to `server/`; the optional Compose import service mounts it read-only at `/bible_databases`. To use another checkout, set `BIBLER_SERVER_BIBLE_DATABASES_PATH` in the root Compose environment. AI requests are processed by the API; Ollama runs separately. Set the default model in `server/.env` with `BIBLER_SERVER_OLLAMA_MODEL`; an individual request may select its own model. `BIBLER_SERVER_OLLAMA_TEST_MODEL` lets the live smoke check use another installed model without changing normal application requests.

```sh
npm run db:bootstrap  # verify/adopt the supported schema and apply migrations
npm run db:seed       # initialize a fresh administrator after setting the password below
npm run db:import     # stream scripture content from the configured source checkout
npm run prisma:generate
```

For a fresh installation, set `BIBLER_SERVER_BOOTSTRAP_ADMIN_PASSWORD` to your own password (at least 6 characters) in `server/.env` before seeding. Optional `BIBLER_SERVER_BOOTSTRAP_ADMIN_USERNAME` and `BIBLER_SERVER_BOOTSTRAP_ADMIN_EMAIL` customize that account. `BIBLER_SERVER_IMPORT_TRANSLATIONS` can select comma-separated upstream translation abbreviations; unset imports all available translations. After import, select AI reference Bible defaults in the UI settings.

Do not run seed or import commands as part of an upgrade. Existing accounts, password hashes, bearer tokens, content, and AI defaults survive schema adoption. The supported upgrade source is the final version 4 application schema on PostgreSQL 18. Startup checks full PostgreSQL catalogs, including index expressions/predicates and constraints, before adopting an existing database; incompatible or failed migrations stop startup. Empty databases are provisioned from the same migration history.

For new schema changes, edit Prisma and generate a development migration with `npm run prisma:migrate`. Apply the complete migration history to a disposable database, then run `npm run db:catalog` against that database to update `server/prisma/schema-catalog.json`; commit the migration and that current-schema snapshot. Never rewrite `server/prisma/baseline-catalog.json`, which defines the immutable version 4 adoption contract. Application fields use Prisma mappings to preserve physical SQL names. Partial/expression indexes and checks also require SQL and catalog verification.

## Build and verification

```sh
npm run build
npm run typecheck
npm test
# Point this at an isolated PostgreSQL 18 instance whose role may create test databases:
docker compose -f docker-compose.development.yml exec bibler-postgresql createdb -U bibler bibler_test
BIBLER_SERVER_TEST_DATABASE_URL=postgresql://bibler:password@localhost:5433/bibler_test npm run test:integration
# Optional live provider smoke test, with Ollama configured in server/.env:
npm run test:ai:live --workspace=bibler-server
```

Integration checks create disposable databases to exercise empty installs, adoption with preserved data, repeated and concurrent startup, and schema/migration rejection. Unit checks use deterministic AI responses and require no external model service. The live Ollama check is an additional configured check.

REST resources live under `/api`, use camelCase JSON and pagination fields, retain resource envelopes and UUIDs, and use kebab-case path segments. Scripture routes are explicit, for example `/api/bibles/:bibleUuid/books/:bookUuid/chapters/:chapter/verses`. Sessions use opaque bearer tokens. The MCP endpoint remains `/mcp`, with its independent JSON-RPC, session, and SSE contracts. The UI's Developer API page includes scripture examples.

## Full container stack

The full Compose file includes the development PostgreSQL service and adds application containers. It keeps the same database storage, runs the API on port `3000` and UI on `4200`, and reaches host Ollama through `host.docker.internal` by default.

```sh
# Build from this checkout and start all services:
npm run docker:up:full
# Or use published application images:
docker compose -f docker-compose.full.yml pull
docker compose -f docker-compose.full.yml up -d --no-build --wait
# Optionally import content from the read-only source checkout:
docker compose -f docker-compose.full.yml --profile import run --rm bibler-import
# Stop services while retaining data:
npm run docker:down:full
```

Both Dockerfiles use the repository root as their build context:

```sh
docker build -f server/Dockerfile -t p3000/bibler-server:local .
docker build -f ui/Dockerfile -t p3000/bibler-ui:local .
```

Drone runs type checking, unit/contract tests, production builds, and isolated database integration tests before publishing either image. amd64 and arm64 pipelines publish branch architecture tags plus immutable commit architecture tags; manifests expose branch and commit tags. Only successful `master` builds publish `latest`. Drone requires `docker_username` and `docker_password` secrets and trusted Docker socket access on both architecture runners.

## Coordinated release and rollback

1. Build and validate both application images from the same commit. Confirm both commit-tag manifests exist and rehearse against a restored copy of the deployment database.
2. Save a PostgreSQL backup and record the currently deployed UI/server image references and configuration. Check that the database is the supported version 4 schema and PostgreSQL 18 before the first adoption.
3. Schedule the restart window, stop application traffic and both application containers, and retain the PostgreSQL volume. Do not run seed/import operations.
4. Set both image references to the same verified commit tag and keep the existing database URL and externally visible server origin. Start the API, wait for migration/bootstrap and `/health`, then start the UI and restore traffic.
5. Verify login, permissions, scripture reading/search/comparison, collaborative study edits, sermons/documents, AI streaming, and MCP before ending the window.
6. If validation fails, stop both application containers and restore the previously recorded image pair. If any release changed schema or data incompatibly, restore the saved database backup before restarting that pair. Recheck health and user workflows before reopening traffic.

Never remove database volumes during a release or rollback. Production deployment is a separate operator action after these checks pass.
