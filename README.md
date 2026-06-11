# Sky Novel Hermes

Sky Novel Hermes is a Tauri desktop app for lawful novel download management, local library organization, AI-assisted analysis, multilingual post-processing, preview, and export packaging.

The GUI is built with Tauri, Vite, React, and TypeScript. Crawling, queueing, storage, exports, and AI analysis run in a Node.js v22 local service. The first hard-coded site adapter targets `https://big5.quanben5.io`.

## Requirements

- Node.js 22+
- pnpm 9+
- Rust stable and Cargo for Tauri
- Optional PostgreSQL 14+ if you do not want to use the default SQLite local cache
- A running LiteLLM/OpenAI-compatible API endpoint if AI features are enabled

## Quick Start

```powershell
pnpm install
pnpm dev
```

The Node service stores cached metadata, catalogs, chapter content, and download tasks through a selectable storage backend. SQLite is the default and writes to `./storage/hermes.sqlite`. PostgreSQL can be enabled in the app Settings page, or by setting `HERMES_STORAGE_BACKEND=postgres` with `HERMES_DATABASE_URL` or `DATABASE_URL`. The service creates the required tables on startup.

Downloaded novel content is stored as structured chapter records in the selected backend. Each chapter can keep plain text and HTML, which makes the database the canonical cache while TXT, Markdown, ZIP, and future EPUB/PDF files are generated as export artifacts. The Multilingual Processing page can detect downloaded book language, start AI translation tasks for a target language, pause/resume/cancel those tasks, retry failed chapters, and retranslate unsatisfactory content. The Packaging page lets you choose the book, language, export format, output directory, and file name at export time; Settings controls the default export directory and translation prompt.

`pnpm dev` runs the Node service and Tauri desktop app in parallel. You can also run them in two terminals when debugging one side at a time:

```powershell
# terminal 1
pnpm dev:service

# terminal 2
pnpm dev:desktop
```

The Node service defaults to `http://127.0.0.1:17891`. The desktop app reads from `VITE_HERMES_SERVICE_URL` when set, otherwise it uses that local URL.

## AI Translation

AI features use a LiteLLM/OpenAI-compatible endpoint configured through environment variables. The Node service loads a `.env` file from the workspace root on startup, so you can put the same keys in `./.env` and restart the service:

```powershell
$env:LITELLM_BASE_URL = "http://127.0.0.1:4000"
$env:LITELLM_MODEL = "gpt-4o-mini"
$env:LITELLM_API_KEY = "optional-key"
```

```dotenv
LITELLM_BASE_URL=http://127.0.0.1:4000/v1
LITELLM_MODEL=gpt-4o-mini
LITELLM_API_KEY=optional-key
```

Values already present in the shell environment take precedence over `.env`. Frontend-only values must still use Vite's `VITE_` prefix, for example `VITE_HERMES_SERVICE_URL`.

Language detection runs after downloads complete and can also be triggered manually from the Multilingual Processing page. Translation does not fetch new source content; it only processes chapters already downloaded into the local library. The default translation prompt is editable from Settings and is stored in the local settings file alongside retry and chunk-size preferences.

The AI Configuration page shows locally recorded usage for each AI request, plus aggregate totals and per-task totals when the provider returns OpenAI-compatible `usage` fields. Provider account cycle balance or remaining quota is not calculated unless the upstream service exposes that information through a compatible API.

## First Sample

The initial sample source is:

```text
https://big5.quanben5.io/n/moshi_wodunliaoyiwanwuzi/xiaoshuo.html
```

The `quanben5-big5` adapter extracts book metadata, catalog entries, and authorized chapter content. Downloader behavior is rate-limited and records source attribution.

## Main Scripts

- `pnpm dev` runs service and desktop in parallel.
- `pnpm dev:service` runs the Node service.
- `pnpm dev:desktop` runs the Tauri desktop app.
- `pnpm build` builds all packages.
- `pnpm test` runs package tests.
- `pnpm typecheck` checks TypeScript.

Run `pnpm build` before using package-level `start` scripts that expect generated `dist/` output.
The default desktop build skips Windows installer bundling so local verification does not depend on downloading WiX/NSIS. Use `pnpm --filter @sky-novel-hermes/desktop build:bundle` when you explicitly need an installer.
