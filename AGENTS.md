# AGENTS.md

## Project Overview

Sky Novel Hermes is a Tauri desktop application for lawful novel download management, metadata extraction, local library organization, AI-assisted analysis, AI proofreading, preview, and export packaging.

The desktop shell uses Tauri. Crawling, download queues, storage orchestration, and AI integration run in a Node.js v22 local service. The browser automation layer uses CloakBrowser through a provider abstraction.

## Core Requirements

- Supported crawling sites are hard-coded in the source tree and registered through a central site registry.
- Each site lives in its own folder/module and implements the shared site adapter contract.
- Site adapters must provide connection checks, search, book info extraction, catalog extraction, and chapter content extraction.
- LiteLLM or another OpenAI-compatible provider is used through an external API endpoint.
- The app includes Home, Search, Download Manager, Multilingual Processing, Content Proofreading, Downloaded Library, Packaging, Preview, AI Configuration, and Settings views.
- Preview is the local reader for downloaded content. It should be reachable from library/export workflows, read stored chapter text from the active storage backend, support available translations, original/translation compare, and current-chapter retranslation.
- Content Proofreading uses the same AI task semantics as translation: configurable prompt, chunk size, retry budget, pause/resume/cancel, failed chapter retry, and per-chapter result storage. Proofreading records must preserve the original chapter text and corrected text for comparison; applying repairs may update the stored chapter text only after the comparison record is saved.
- UI should be concise, tool-oriented, information-dense, and visually polished.

## Compliance Rules

- Do not implement bypasses for paywalls, authentication, DRM, CAPTCHAs, or access controls.
- Respect robots.txt, rate limits, retry budgets, and source attribution.
- Do not hard-code credentials, API keys, cookies, or proxy credentials.
- Keep downloads local and user-initiated.
- Preserve the CC BY-NC-SA 4.0 licensing stance: forks, modified versions, and derivative repositories must attribute the original Sky Novel Hermes repository, identify meaningful changes, remain non-commercial, and use the same license terms.
- Keep `LICENSE`, `NOTICE.md`, README license text, and package `license` metadata aligned when license or responsible-use terms change.
- Treat direct source-site domains and sample work URLs as sensitive in user-facing documentation. Do not publish specific source-site domains or sample catalog URLs in README, release notes, screenshots, or marketing/user docs unless the user explicitly requests it. Internal agent/developer docs may retain minimal adapter/domain details needed for maintenance.

## Architecture

- `apps/desktop`: Tauri + Vite + React TypeScript frontend.
- `apps/node-service`: Node.js v22 local service for crawling, queueing, storage, AI, and exports.
- `packages/shared`: shared TypeScript types and validation schemas.
- `packages/sites`: hard-coded site adapters.
- `packages/storage`: selectable SQLite/PostgreSQL schema and repositories for metadata/cache persistence.
- `packages/ai`: LiteLLM/OpenAI-compatible client and analysis workflows.
- `packages/exporter`: TXT, Markdown, ZIP, and future EPUB export logic.

## Site Adapter Contract

Every site adapter must implement:

- `checkConnection`
- `search`
- `getBookInfo`
- `getCatalog`
- `getChapter`

Adapters should use deterministic HTML parsing first, browser rendering second, and LiteLLM assistance only as a fallback.

## Quanben5 Sites

The Quanben5 site adapters are:

- `quanben5-big5`, targeting `https://big5.quanben5.io`
- `quanben5-simplified`, targeting `https://www.quanben5.io`

Both adapters share the `packages/sites/src/quanben5` module and extract metadata, catalog records, and authorized chapter content from user-provided URLs. Keep all selectors isolated in the site module. Do not add sample work URLs here.

## Development Commands

- `pnpm install`
- `pnpm dev:service`
- `pnpm dev:desktop`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm --filter @sky-novel-hermes/desktop build:bundle` for installer/release bundle generation

## Versioning

- The app version is single-sourced and kept in sync across `package.json`, `apps/desktop/package.json`, `apps/node-service/package.json`, `apps/desktop/src-tauri/tauri.conf.json`, and `apps/desktop/src-tauri/Cargo.toml`.
- Run `pnpm version:bump` to raise the version (default `+0.0.1`); pass a `MAJOR.MINOR.PATCH` delta (e.g. `node scripts/bump-version.mjs 0.1.0`), `--major`/`--minor`/`--patch`, or `--set X.Y.Z` for an exact version.
- The bump script (`scripts/bump-version.mjs`) updates all version fields, commits the change as `chore: release vX.Y.Z`, and creates the `vX.Y.Z` git tag. Use `--no-commit`, `--no-tag`, or `--dry-run` to opt out. Pushing the tag is manual (`git push origin vX.Y.Z`).
- The desktop frontend reads the version from `apps/desktop/package.json` via the Vite `__APP_VERSION__` define and shows it in the Settings “关于” panel; keep that wiring intact when changing the build config.
- When bumping versions or changing the version workflow, keep this file and the version-bearing files above aligned.

## Release Automation

- GitHub Actions release packaging lives in `.github/workflows/release.yml`.
- Pushing a tag matching `v*` builds the Windows Tauri bundle on `windows-latest` and uploads generated artifacts from `apps/desktop/src-tauri/target/release/bundle` to the matching GitHub Release.
- The release workflow can also be run manually with an existing tag through `workflow_dispatch`.
- Release CI should run `pnpm typecheck`, `pnpm test`, and `pnpm --filter @sky-novel-hermes/desktop build:bundle` before publishing artifacts.

## Coding Guidelines

- Use TypeScript across frontend, backend, and shared packages.
- Validate external API payloads with shared schemas where practical.
- Keep site-specific selectors isolated inside each site module.
- Do not hard-code secrets.
- Store LiteLLM configuration in environment variables or local app settings.
- Keep SQLite available as the default local cache; PostgreSQL can be selected in Settings or configured with `HERMES_STORAGE_BACKEND=postgres` plus `HERMES_DATABASE_URL` or `DATABASE_URL`.
- Keep crawler logs structured and visible in the Download Manager.
- Keep duplicate URL imports conflict-aware: surface existing books/download tasks/translation tasks, then require an explicit overwrite or append-copy choice. Cancelled download, translation, and proofreading tasks must not be resumable or retryable.
- Keep Preview and Content Proofreading behavior documented in the README when reader, translation preview, proofreading compare, repair writeback, or retranslation workflows change.
- Use small, testable parser functions with HTML fixtures.
- When changing important app features, user-facing workflows, project operations, build scripts, CI workflows, release automation, supported tooling, or setup commands, update this `AGENTS.md` file with the new maintenance expectations and update the README when user-facing behavior or instructions change.

## UI Guidelines

- Build the usable app as the first screen, not a landing page.
- Prefer tool-style layouts with clear navigation, dense tables, status badges, and focused panels.
- Avoid decorative card nesting and oversized hero sections.
- Keep text readable and prevent layout shifts in queues, tables, and toolbars.
- `docs/THEME.md` is the source of truth for the desktop visual design. Follow it for palette, tokens, components, motion/effects, and accessibility rules.
- Design tokens live in `apps/desktop/src/theme.css`; layout/component styles in `apps/desktop/src/styles.css` must consume tokens via `var(--*)`. Do not hard-code color literals outside `theme.css`.
- The app is dark-first with a light toggle in Settings, persisted in `localStorage` (`hermes-theme`) and applied via `document.documentElement[data-theme]` (bootstrapped inline in `index.html` to avoid theme flash).
- Provide effect-driven feedback: toasts for action results, animated progress, pulsing running indicators, live row-flash on WebSocket updates, skeleton loaders during fetches, and view/hover/press transitions. Respect `prefers-reduced-motion`.
- Reusable UI primitives live in `apps/desktop/src/ui/components` (`ui.tsx`, `toast.tsx`); each main view lives in its own file under `apps/desktop/src/ui/views`. When adding tokens, update both theme blocks in `theme.css` and `docs/THEME.md`.

## Testing

- Add parser fixture tests for each site adapter.
- Add queue state transition tests.
- Add storage repository tests.
- Add frontend smoke tests for main views when practical.
