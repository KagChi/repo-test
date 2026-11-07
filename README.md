# Monorepo

A scalable, high-performance monorepo powered by [Bun](https://bun.sh) workspaces,
[TypeScript](https://www.typescriptlang.org), and [Biome](https://biomejs.dev).

## Requirements

| Tool       | Version    | Notes                                                      |
| ---------- | ---------- | ---------------------------------------------------------- |
| Bun        | `>= 1.2.0` | Package manager and runtime (`packageManager: bun@1.4.4`). |
| Biome      | `>= 2.0.0` | Installed as a root dev dependency (currently `2.6.6`).    |
| TypeScript | `>= 5.9.0` | Installed as a root dev dependency.                        |
| Node.js    | not needed | Bun provides the toolchain; no Node runtime is required.   |

## Getting started

```bash
bun install          # install all workspace dependencies and link internal packages
bun run typecheck    # type-check every workspace
bun run check        # Biome lint + format checks across the repo
bun run test         # run the Bun test suite
bun run build        # build every workspace that defines a build script
```

Handy extras:

```bash
bun run check:fix    # apply Biome lint and format fixes
bun run format       # apply Biome formatting only
bun run lint         # run Biome lint rules only
```

## Layout

```text
.
├── apps/                  # Deployable applications
│   └── web/               # Placeholder Bun app that consumes @repo/shared-utils
├── packages/              # Shared modules and internal configuration
│   ├── config-biome/      # Shared Biome lint/format rules
│   ├── config-typescript/ # Shared tsconfig bases
│   └── shared-utils/      # Shared TypeScript utilities
├── biome.json             # Root Biome config (extends @repo/config-biome)
├── bun.lock               # Single lockfile for the whole monorepo
├── package.json           # Root config with workspace definitions and scripts
└── README.md
```

Workspace packages are namespaced under `@repo/*` and reference each other with the
`workspace:*` protocol, so Bun links them locally without publishing anything.

## Tooling

### Biome

The root `biome.json` is marked as the config root and extends
`@repo/config-biome/biome.json`, which holds the shared formatter/linter rules
(2-space indentation, 100-column lines, double quotes, recommended lint preset, import
sorting). Workspace packages that need to be checked independently opt in with a thin
`biome.json`:

```json
{
  "root": false,
  "extends": ["@repo/config-biome/biome.json"]
}
```

Override individual rules in a workspace config only when necessary; prefer keeping
shared conventions in `packages/config-biome`.

### TypeScript

`packages/config-typescript` exposes three bases:

- `@repo/config-typescript/tsconfig.json` — strict, ESM-first base config.
- `@repo/config-typescript/tsconfig.bun.json` — base plus Bun type definitions.
- `@repo/config-typescript/tsconfig.react.json` — base plus DOM libs and JSX support.

A workspace `tsconfig.json` extends the appropriate base:

```json
{
  "extends": "@repo/config-typescript/tsconfig.bun.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

Because the base config sets `noEmit: true`, type checking is always a verification
step; each workspace owns its own build command.

## Adding a workspace

1. Create the directory inside `apps/` (deployable) or `packages/` (shared library):

   ```bash
   mkdir -p packages/my-lib/src
   ```

2. Add `packages/my-lib/package.json`, using the `@repo/` namespace and workspace
   dependencies for internal packages:

   ```json
   {
     "name": "@repo/my-lib",
     "version": "0.1.0",
     "private": true,
     "type": "module",
     "main": "./src/index.ts",
     "types": "./src/index.ts",
     "exports": {
       ".": "./src/index.ts"
     },
     "scripts": {
       "build": "bun build ./src/index.ts --outdir ./dist --target bun",
       "typecheck": "tsc --noEmit"
     },
     "devDependencies": {
       "@repo/config-typescript": "workspace:*",
       "@types/bun": "^1.3.4",
       "typescript": "^5.9.3"
     }
   }
   ```

3. Add a `tsconfig.json` extending `@repo/config-typescript/tsconfig.bun.json` (or the
   React base) and an `include` glob for your sources.

4. Add a workspace `biome.json` if the package should be checked in isolation:

   ```json
   {
     "root": false,
     "extends": ["@repo/config-biome/biome.json"]
   }
   ```

5. Run `bun install` from the repository root to register the workspace, link internal
   dependencies, and update the single `bun.lock`.

6. Reference it from another workspace with the workspace protocol:

   ```json
   {
     "dependencies": {
       "@repo/my-lib": "workspace:*"
     }
   }
   ```

7. Verify everything from the root:

   ```bash
   bun install
   bun run check && bun run typecheck && bun run test && bun run build
   ```

## Scripts reference

| Script              | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `bun run build`     | Runs `build` in every workspace that defines it.     |
| `bun run check`     | `biome check .` over the whole repository.           |
| `bun run check:fix` | `biome check --write .` (applies safe fixes).        |
| `bun run format`    | `biome format --write .`.                            |
| `bun run lint`      | `biome lint .`.                                      |
| `bun run test`      | `bun test` across workspaces.                        |
| `bun run typecheck` | Runs `typecheck` in every workspace that defines it. |
