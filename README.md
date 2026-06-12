# Sky Novel Hermes

Sky Novel Hermes is a Tauri desktop app for lawful novel download management, local library organization, AI-assisted analysis, multilingual post-processing, AI proofreading, preview, and export packaging.

The GUI is built with Tauri, Vite, React, and TypeScript. Crawling, queueing, storage, exports, and AI analysis run in a Node.js v22 local service. Source adapters are registered in the application code and operate on user-provided URLs.

## License and Responsible Use

Sky Novel Hermes is licensed under [CC BY-NC-SA 4.0](LICENSE). You may fork, modify, and redistribute this repository for non-commercial purposes only. Forks, modified versions, and derivative repositories must clearly state that they are based on the original Sky Novel Hermes repository, preserve attribution, identify meaningful changes, and use the same license terms.

This project is provided only as a personal-use tool for lawful download management and local library organization. It does not grant rights to third-party content, does not guarantee the copyright status, legality, accuracy, availability, or quality of any downloaded content or metadata, and must not be used for infringement or any other unlawful purpose. See [NOTICE.md](NOTICE.md) for the full responsible-use notice.

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

Downloaded novel content is stored as structured chapter records in the selected backend. Each chapter can keep plain text and HTML, which makes the database the canonical cache while TXT, Markdown, ZIP, and future EPUB/PDF files are generated as export artifacts. URL import checks for an existing local book, download task, or translation task for the same source URL; when a match is found, the app lets you either overwrite the existing local record or import a separate copy with a suffix. The Download Manager shows the book associated with each task, can open the corresponding downloaded book, and keeps pause/continue plus cancel/retry actions mutually exclusive. The Downloaded Library can delete a local book and its stored chapters/translations/proofreading records, and cancelled download tasks cannot be resumed. The Preview page is the local reader for downloaded content: it opens from the Downloaded Library and Packaging pages, reads stored chapter text from the selected backend, can switch to available translated versions, can show original and translated text side by side, and can submit a retranslation request for the currently selected translated chapter. The Multilingual Processing page can detect downloaded book language, start AI translation tasks for a target language, pause/resume/cancel those tasks, retry failed chapters, and retranslate unsatisfactory content. The Content Proofreading page can start AI proofreading for downloaded chapters, retry/pause/resume/cancel proofreading tasks, review original/corrected chapter pairs through an inline change-tracking diff (with a side-by-side fallback) that highlights exactly which text was inserted or removed and summarizes the change count, and optionally apply corrections back to the stored chapter text while preserving the original text in the proofreading record. The Packaging page lets you choose the book, language, export format, output directory, and file name at export time; Settings controls the default export directory, translation prompt, and proofreading prompt. The interface is a dark-first, tool-oriented workspace with dense tables, status badges, animated progress, and live update feedback; an appearance toggle in Settings switches between the dark and light themes and the choice is remembered locally.

`pnpm dev` starts the Node service first, waits until `http://127.0.0.1:17891/api/status` is reachable, and then starts the Tauri desktop app. This prevents the desktop UI from opening before the local API is ready. You can also run them in two terminals when debugging one side at a time:

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

Language detection runs after downloads complete and can also be triggered manually from the Multilingual Processing page. Translation and proofreading do not fetch new source content; they only process chapters already downloaded into the local library. The default translation and proofreading prompts are editable from Settings and are stored in the local settings file alongside retry and chunk-size preferences. Proofreading stores both the original chapter text sent to the model and the corrected text returned by the model; when automatic repair is enabled, the corrected text is written back to the chapter cache after that comparison record is saved.

The AI Configuration page shows locally recorded usage for each AI request, plus aggregate totals and per-task totals when the provider returns OpenAI-compatible `usage` fields. Provider account cycle balance or remaining quota is not calculated unless the upstream service exposes that information through a compatible API.

## Source Adapters

Source adapters extract book metadata, catalog entries, and authorized chapter content from user-provided URLs. Downloader behavior is rate-limited and records source attribution.

## Main Scripts

- `pnpm dev` runs service and desktop in parallel.
- `pnpm dev:service` runs the Node service.
- `pnpm dev:desktop` runs the Tauri desktop app.
- `pnpm build` builds all packages.
- `pnpm test` runs package tests.
- `pnpm typecheck` checks TypeScript.

Run `pnpm build` before using package-level `start` scripts that expect generated `dist/` output.
The default desktop build skips Windows installer bundling so local verification does not depend on downloading WiX/NSIS. Use `pnpm --filter @sky-novel-hermes/desktop build:bundle` when you explicitly need an installer.

## Release Packaging

GitHub Actions builds Windows release packages automatically when a tag starting with `v` is pushed:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

The release workflow installs Node.js 22, pnpm, and stable Rust, then runs `pnpm typecheck`, `pnpm test`, and `pnpm --filter @sky-novel-hermes/desktop build:bundle` on `windows-latest`. The generated Tauri installers from `apps/desktop/src-tauri/target/release/bundle` are uploaded to the matching GitHub Release.

You can also run the same workflow manually from the GitHub Actions page by choosing the `Release` workflow and entering an existing tag such as `v0.1.0`.
