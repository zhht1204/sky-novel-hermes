# AGENTS.md

## Project Overview

Sky Novel Hermes is a Tauri desktop application for lawful novel download management, metadata extraction, local library organization, AI-assisted analysis, preview, and export packaging.

The desktop shell uses Tauri. Crawling, download queues, storage orchestration, and AI integration run in a Node.js v22 local service. The browser automation layer uses CloakBrowser through a provider abstraction.

## Core Requirements

- Supported crawling sites are hard-coded in the source tree and registered through a central site registry.
- Each site lives in its own folder/module and implements the shared site adapter contract.
- Site adapters must provide connection checks, search, book info extraction, catalog extraction, and chapter content extraction.
- LiteLLM or another OpenAI-compatible provider is used through an external API endpoint.
- The app includes Home, Search, Download Manager, Downloaded Library, Packaging, Preview, and Settings views.
- UI should be concise, tool-oriented, information-dense, and visually polished.

## Compliance Rules

- Do not implement bypasses for paywalls, authentication, DRM, CAPTCHAs, or access controls.
- Respect robots.txt, rate limits, retry budgets, and source attribution.
- Do not hard-code credentials, API keys, cookies, or proxy credentials.
- Keep downloads local and user-initiated.

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
- Sample catalog URL: `https://big5.quanben5.io/n/moshi_wodunliaoyiwanwuzi/xiaoshuo.html`

Both adapters share the `packages/sites/src/quanben5` module and extract metadata, catalog records, and authorized chapter content. Keep all selectors isolated in the site module.

## Development Commands

- `pnpm install`
- `pnpm dev:service`
- `pnpm dev:desktop`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm --filter @sky-novel-hermes/desktop build:bundle` for installer/release bundle generation

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
- Use small, testable parser functions with HTML fixtures.
- When changing project operations such as build scripts, CI workflows, release automation, supported tooling, or setup commands, update this `AGENTS.md` file and the README when user-facing instructions change.

## UI Guidelines

- Build the usable app as the first screen, not a landing page.
- Prefer tool-style layouts with clear navigation, dense tables, status badges, and focused panels.
- Avoid decorative card nesting and oversized hero sections.
- Keep text readable and prevent layout shifts in queues, tables, and toolbars.

## Testing

- Add parser fixture tests for each site adapter.
- Add queue state transition tests.
- Add storage repository tests.
- Add frontend smoke tests for main views when practical.
