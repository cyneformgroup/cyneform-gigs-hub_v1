# Cyneform Monorepo - Project Structure

## Overview
**Cyneform** is a full-stack monorepo application built with **Bun** (v1.3.14+) as the runtime. It uses Bun's native workspace feature to organize code into reusable packages and separate applications for the API and web frontend.

The project structure is what Claude will be working with day-to-day — the actual source files, configurations, and directory layout beneath `cyneform_gifs/`.

---

## Root Directory

```
cyneform-gigs/
├── package.json              # Root workspace config, scripts, engine requirements
├── bun.lock                  # Bun lockfile — lockfile for all workspaces
├── lefthook.yml              # Git hook configuration (Lefthook v2)
├── .env                      # Environment variables (DB_HOST, DB_PORT, etc.)
├── docker-compose.yml        # MariaDB 11.4 service definition
├── biome.json                # Biome linter/formatter config
├── .gitignore                # Git ignore rules
├── .gitattributes            # Git attributes
├── .dockerignore             # Docker build ignore rules
├── node_modules/             # Installed dependencies (Bun-installed)
└── README.md                 # Project overview
```

---

## Packages (shared libraries)

### `@cyneform/db` — Database & ORM Layer
**Location**: `cyneform_gigs/packages/db/`

Purpose: MySQL connection pool, Drizzle ORM setup, and database schemas.

| File | Description |
|------|-------------|
| `src/client.ts` | Creates `mysql2` pool and exports `db` (Drizzle instance) + `schema` |
| `src/env/index.ts` | Dotenv loading + Zod validation for `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DATABASE_URL` |
| `src/users/schema/index.ts` | Drizzle `mysqlTable` definition for `roles` table (UUIDv7 id, name, createdAt) |

**Technologies**: `drizzle-orm`, `mysql2`, `drizzle-kit`, `zod`, `dotenv`, `typescript`

---

### `@cyneform/validators` — Zod Validation Schemas
**Location**: `cyneform_gigs/packages/validators/`

Purpose: Reusable Zod schemas shared across the codebase.

| File | Description |
|------|-------------|
| `src/index.ts` | Re-exports all validators |
| `src/health.ts` | `HealthResponseSchema` — `{ status: "ok", database: "up" | "down", time: string }` |

**Technologies**: `zod`, `typescript`

---

### `@cyneform/types` — Type Exports
**Location**: `cyneform_gigs/packages/types/`

Purpose: Type-only package re-exporting validators for consumption by other packages/apps.

| File | Description |
|------|-------------|
| `src/index.ts` | `export type * from "./health"` — re-exports `HealthResponse` type |
| `src/health.ts` | Minimal — exists to be re-exported |

**Technologies**: `typescript`, `@cyneform/validators` (workspace dep)

---

## Applications

### `@cyneform/api` — NestJS Backend Server
**Location**: `cyneform_gigs/apps/api/`

Framework: NestJS 12 with Express adapter. This is the primary API server.

| File | Description |
|------|-------------|
| `src/main.ts` | Bootstrap: creates Nest app, applies Helmert, cookie-parser, CORS, global prefix `api/v1`, pipe (ZodValidationPipe) |
| `src/app.module.ts` | Root module: `ConfigModule` (envFilePath: `../../.env, .env`), `DatabaseModule`, `ZodValidationPipe` as global pipe, `HealthController` |
| `src/config/env.ts` | App-level Env schema (extends root: `NODE_ENV`, `PORT`, `CORS_ORIGIN`) + `validateEnv()` function |
| `src/database/database.module.ts` | Nest module providing `DB_POOL` (pool) and `DB` (drizzle) symbols, globally exported |
| `src/health/health.controller.ts` | `GET /health` endpoint: pings the MySQL pool, returns `{ status, database, time }` |
| `src/**` (subdirs) | `config/`, `database/`, `health/` — module boundaries |

**Technologies**: `@nestjs/common`, `@nestjs/core`, `@nestjs/config`, `@nestjs/throttler`, `argon2`, `cookie-parser`, `helmet`, `rxjs`, `nestjs-zod`, `zod`, `reflect-metadata`

---

### `@cyneform/web` — React Frontend
**Location**: `cyneform_gigs/apps/web/`

Framework: React 19 + Vite + Tailwind CSS 4.

| File | Description |
|------|-------------|
| `src/main.tsx` | Creates `react-dom/client` root render, renders `<StrictMode><App /></StrictMode>` |
| `src/App.tsx` | Main app component: fetches `GET /api/v1/health` on mount, displays status/database state |
| `src/index.css` | Global styles (Tailwind `@tailwind` directives) |
| `src/assets/` | Static assets directory |
| `src/index.html` | HTML template served by Vite |

**Technologies**: `react` 19, `react-dom` 19, `vite` 8, `@vitejs/plugin-react`, `tailwindcss` 4, `@tailwindcss/vite`, `zod` (via `@cyneform/validators`)

---

## Database Layer

- **Database engine**: MariaDB 11.4 (defined in `docker-compose.yml`, service `mariadb`)
- **Connection**: `mysql2` connection pool (`packages/db/src/client.ts`)
- **ORM**: Drizzle ORM with `mysql-core` and `mysql2` drivers
- **Migration tool**: `drizzle-kit` (scripts: `db:generate`, `db:push`, `db:migrate`)
- **Studio GUI**: `db:studio` opens `drizzle-kit` studio UI
- **Schema**: `packages/db/src/users/schema/index.ts` — `roles` table with UUIDv7 primary key, unique name, timestamp

---

## Available Scripts (root `bun`)

| Script | Description |
|--------|-------------|
| `dev` | Start all apps in dev mode (parallel across workspaces) |
| `start` | Start all apps in production mode (parallel) |
| `build` | Build all apps (parallel) |
| `lint` | `biome check .` — lint entire codebase |
| `lint:fix` | `biome check --write .` — auto-fix lint issues |
| `format` | `biome format --write .` — format code |
| `typecheck` | Type-check all packages and apps |
| `test` | `bun run --filter './apps/*' test` — run tests on apps |
| `db:up` | `docker compose up -d mariadb` |
| `db:down` | `docker compose down` |
| `db:generate` | `bun --cwd packages/db db:generate` |
| `db:push` | `bun --cwd packages/db db:push` |
| `db:migrate` | `bun --cwd packages/db db:migrate` |
| `db:studio` | `bun --cwd packages/db db:studio` |
| `prepare` | `lefthook install` — install git hooks |

---

## Directory Tree (full)

```
cyneform-gigs/
├── package.json
├── bun.lock
├── lefthook.yml
├── .env
├── docker-compose.yml
├── biome.json
├── .gitignore
├── .gitattributes
├── .dockerignore
├── node_modules/
├── README.md
└── cyneform_gigs/
    ├── packages/
    │   ├── db/
    │   │   ├── package.json
    │   │   ├── tsconfig.json
    │   │   ├── drizzle.config.ts
    │   │   └── src/
    │   │       ├── client.ts
    │   │       ├── env/
    │   │       │   └── index.ts
    │   │       └── users/
    │   │           └── schema/
    │   │               └── index.ts
    │   ├── validators/
    │   │   ├── package.json
    │   │   ├── tsconfig.json
    │   │   └── src/
    │   │       ├── index.ts
    │   │       └── health.ts
    │   └── types/
    │       ├── package.json
    │       ├── tsconfig.json
    │       └── src/
    │           ├── index.ts
    │           └── health.ts
    └── apps/
        ├── web/
        │   ├── package.json
        │   ├── tsconfig.json
        │   ├── tsconfig.app.json
        │   ├── tsconfig.node.json
        │   ├── vite.config.ts
        │   ├── index.html
        │   ├── src/
        │   │   ├── main.tsx
        │   │   ├── App.tsx
        │   │   ├── index.css
        │   │   └── assets/
        │   └── dist/       (built output)
        └── api/
            ├── package.json
            ├── tsconfig.json
            ├── tsconfig.build.json
            ├── vitest.config.ts
            ├── vitest.config.e2e.ts
            ├── src/
            │   ├── main.ts
            │   ├── app.module.ts
            │   ├── config/
            │   │   └── env.ts
            │   ├── database/
            │   │   └── database.module.ts
            │   └── health/
            │       └── health.controller.ts
            ├── dist/         (built output)
            ├── test/
            └── node_modules/
```

---

## What Claude Will Be Providing

The actual source files listed above — particularly under `cyneform_gigs/apps/` and `cyneform_gigs/packages/` — are the files Claude will be working with. This document maps every source file, its purpose, and the technology stack each part of the codebase uses.

If you need a specific file's contents or want to inspect any part of the structure in more detail, just let me know.